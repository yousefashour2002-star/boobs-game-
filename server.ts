import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import multer from "multer";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/boobsgame";

mongoose.connect(MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection error:", err));

// Schemas
const playerSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  room_id: { type: String, required: true },
  real_name: String,
  fake_name: String,
  age: Number,
  personality: String,
  bio: String,
  avatar_url: String,
  is_blocked: { type: Number, default: 0 },
  is_host: { type: Number, default: 0 },
  points: { type: Number, default: 0 },
  joined_at: { type: Date, default: Date.now }
});

const roomSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  host_id: { type: String, required: true },
  status: { type: String, default: 'waiting' },
  chat_time: { type: Number, default: 300 },
  voting_time: { type: Number, default: 60 },
  round_number: { type: Number, default: 1 },
  timer_left: { type: Number, default: 0 },
  timer_active: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  room_id: { type: String, required: true },
  sender_id: { type: String, required: true },
  receiver_id: String,
  content: String,
  type: { type: String, default: 'text' },
  round_number: { type: Number, default: 1 },
  created_at: { type: Date, default: Date.now }
});

const voteSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  room_id: { type: String, required: true },
  voter_id: { type: String, required: true },
  target_id: { type: String, required: true },
  round_id: String,
  created_at: { type: Date, default: Date.now }
});

const Player = mongoose.model("Player", playerSchema);
const Room = mongoose.model("Room", roomSchema);
const Message = mongoose.model("Message", messageSchema);
const Vote = mongoose.model("Vote", voteSchema);

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  app.use(express.json());
  app.use("/uploads", express.static(uploadDir));

  // API Routes
  app.post("/api/upload", upload.single("avatar"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    res.json({ url: `/uploads/${req.file.filename}` });
  });

  app.post("/api/rooms", async (req, res) => {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    const hostId = uuidv4();
    const room = new Room({ id, host_id: hostId });
    await room.save();
    res.json({ id, hostId });
  });

  app.get("/api/rooms/:id", async (req, res) => {
    const room = await Room.findOne({ id: req.params.id });
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json(room);
  });

  // WebSocket Logic
  const clients = new Map<string, { ws: WebSocket; roomId: string; playerId: string }>();

  wss.on("connection", (ws) => {
    let clientInfo: { roomId: string; playerId: string } | null = null;

    ws.on("message", async (data) => {
      const message = JSON.parse(data.toString());
      const { type, payload } = message;

      switch (type) {
        case "JOIN_ROOM": {
          const { roomId, playerId, realName, isHost } = payload;
          clientInfo = { roomId, playerId };
          clients.set(playerId, { ws, roomId, playerId });

          // Check if player exists, if not create
          let player = await Player.findOne({ id: playerId });
          if (!player) {
            player = new Player({ id: playerId, room_id: roomId, real_name: realName, is_host: isHost ? 1 : 0 });
            await player.save();
          }

          broadcastToRoom(roomId, { type: "PLAYER_JOINED", payload: { playerId, realName } });
          sendRoomState(roomId, ws);
          break;
        }

        case "UPDATE_PROFILE": {
          if (!clientInfo) return;
          const { fakeName, age, personality, bio, avatarUrl } = payload;
          await Player.findOneAndUpdate(
            { id: clientInfo.playerId },
            { fake_name: fakeName, age, personality, bio, avatar_url: avatarUrl }
          );
          
          broadcastToRoom(clientInfo.roomId, { 
            type: "PROFILE_UPDATED", 
            payload: { playerId: clientInfo.playerId, fakeName, avatarUrl } 
          });
          break;
        }

        case "SEND_MESSAGE": {
          if (!clientInfo) return;
          const { content, receiverId, msgType } = payload;
          
          const player = await Player.findOne({ id: clientInfo.playerId });
          if (player?.is_blocked && msgType === 'text') return;

          const room = await Room.findOne({ id: clientInfo.roomId });
          if (!room) return;

          const msgId = uuidv4();
          const newMessage = new Message({
            id: msgId,
            room_id: clientInfo.roomId,
            sender_id: clientInfo.playerId,
            receiver_id: receiverId || null,
            content,
            type: msgType || 'text',
            round_number: room.round_number
          });
          await newMessage.save();

          const msgData = {
            id: msgId,
            senderId: clientInfo.playerId,
            receiverId: receiverId || null,
            content,
            type: msgType || 'text',
            round_number: room.round_number,
            created_at: newMessage.created_at
          };

          if (!receiverId) {
            broadcastToRoom(clientInfo.roomId, { type: "NEW_MESSAGE", payload: msgData });
          } else {
            const receiver = clients.get(receiverId);
            if (receiver) receiver.ws.send(JSON.stringify({ type: "NEW_MESSAGE", payload: msgData }));
            ws.send(JSON.stringify({ type: "NEW_MESSAGE", payload: msgData }));

            if (room.host_id !== clientInfo.playerId && room.host_id !== receiverId) {
              const host = clients.get(room.host_id);
              if (host) host.ws.send(JSON.stringify({ type: "NEW_MESSAGE", payload: { ...msgData, isMonitor: true } }));
            }
          }
          break;
        }

        case "START_VOTING": {
          if (!clientInfo) return;
          await Room.findOneAndUpdate({ id: clientInfo.roomId }, { status: 'voting' });
          broadcastToRoom(clientInfo.roomId, { type: "VOTING_STARTED" });
          break;
        }

        case "CAST_VOTE": {
          if (!clientInfo) return;
          const { targetId } = payload;
          const voteId = uuidv4();
          const vote = new Vote({ id: voteId, room_id: clientInfo.roomId, voter_id: clientInfo.playerId, target_id: targetId });
          await vote.save();
          break;
        }

        case "END_VOTING": {
          if (!clientInfo) return;
          const votes = await Vote.aggregate([
            { $match: { room_id: clientInfo.roomId } },
            { $group: { _id: "$target_id", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ]);
          
          if (votes.length > 0) {
            const mostVoted = votes[0]._id;
            await Player.findOneAndUpdate({ id: mostVoted }, { is_blocked: 1 });
            broadcastToRoom(clientInfo.roomId, { type: "PLAYER_BLOCKED", payload: { playerId: mostVoted } });
          }

          const updatedRoom = await Room.findOneAndUpdate(
            { id: clientInfo.roomId },
            { status: 'playing', $inc: { round_number: 1 } },
            { new: true }
          );
          await Vote.deleteMany({ room_id: clientInfo.roomId });
          broadcastToRoom(clientInfo.roomId, { type: "VOTING_ENDED", payload: { room: updatedRoom } });
          break;
        }

        case "SET_TIMER": {
          if (!clientInfo) return;
          const { seconds } = payload;
          await Room.findOneAndUpdate({ id: clientInfo.roomId }, { timer_left: seconds, timer_active: 1 });
          broadcastToRoom(clientInfo.roomId, { type: "TIMER_UPDATED", payload: { seconds, active: 1 } });
          break;
        }

        case "STOP_TIMER": {
          if (!clientInfo) return;
          await Room.findOneAndUpdate({ id: clientInfo.roomId }, { timer_active: 0 });
          broadcastToRoom(clientInfo.roomId, { type: "TIMER_UPDATED", payload: { active: 0 } });
          break;
        }

        case "TOGGLE_BLOCK": {
          if (!clientInfo) return;
          const { targetId, isBlocked } = payload;
          await Player.findOneAndUpdate({ id: targetId }, { is_blocked: isBlocked ? 1 : 0 });
          broadcastToRoom(clientInfo.roomId, { type: "BLOCK_STATUS_CHANGED", payload: { playerId: targetId, isBlocked } });
          break;
        }

        case "UPDATE_POINTS": {
          if (!clientInfo) return;
          const { targetId, points } = payload;
          await Player.findOneAndUpdate({ id: targetId }, { $inc: { points: points } });
          broadcastToRoom(clientInfo.roomId, { type: "POINTS_UPDATED", payload: { playerId: targetId } });
          break;
        }
      }
    });

    ws.on("close", async () => {
      if (clientInfo) {
        clients.delete(clientInfo.playerId);
        
        // Check if room is empty
        const roomPlayers = Array.from(clients.values()).filter(c => c.roomId === clientInfo!.roomId);
        if (roomPlayers.length === 0) {
          console.log(`Room ${clientInfo.roomId} is empty, cleaning up...`);
          await Room.deleteOne({ id: clientInfo.roomId });
          await Player.deleteMany({ room_id: clientInfo.roomId });
          await Message.deleteMany({ room_id: clientInfo.roomId });
          await Vote.deleteMany({ room_id: clientInfo.roomId });
        }
      }
    });
  });

  function broadcastToRoom(roomId: string, message: any) {
    const data = JSON.stringify(message);
    clients.forEach((client) => {
      if (client.roomId === roomId) {
        client.ws.send(data);
      }
    });
  }

  // Timer interval
  setInterval(async () => {
    const activeRooms = await Room.find({ timer_active: 1, timer_left: { $gt: 0 } });
    for (const room of activeRooms) {
      const newTime = room.timer_left - 1;
      if (newTime <= 0) {
        await Room.findOneAndUpdate({ id: room.id }, { timer_left: 0, timer_active: 0 });
        broadcastToRoom(room.id, { type: "TIMER_FINISHED" });
      } else {
        await Room.findOneAndUpdate({ id: room.id }, { timer_left: newTime });
        broadcastToRoom(room.id, { type: "TIMER_TICK", payload: { seconds: newTime } });
      }
    }
  }, 1000);

  async function sendRoomState(roomId: string, ws: WebSocket) {
    const players = await Player.find({ room_id: roomId });
    const messages = await Message.find({ room_id: roomId });
    const room = await Room.findOne({ id: roomId });
    
    ws.send(JSON.stringify({
      type: "ROOM_STATE",
      payload: { players, messages, room }
    }));
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.listen(3000, "0.0.0.0", () => {
    console.log("Server running on http://localhost:3000");
  });
}

startServer();
