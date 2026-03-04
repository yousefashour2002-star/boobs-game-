import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import multer from "multer";
import fs from "fs";

const db = new Database("game.db");

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

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    host_id TEXT,
    status TEXT DEFAULT 'waiting',
    chat_time INTEGER DEFAULT 300,
    voting_time INTEGER DEFAULT 60,
    round_number INTEGER DEFAULT 1,
    timer_left INTEGER DEFAULT 0,
    timer_active INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    room_id TEXT,
    real_name TEXT,
    fake_name TEXT,
    age INTEGER,
    personality TEXT,
    bio TEXT,
    avatar_url TEXT,
    is_blocked INTEGER DEFAULT 0,
    is_host INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room_id TEXT,
    sender_id TEXT,
    receiver_id TEXT,
    content TEXT,
    type TEXT DEFAULT 'text',
    round_number INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS votes (
    id TEXT PRIMARY KEY,
    room_id TEXT,
    voter_id TEXT,
    target_id TEXT,
    round_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

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
  app.post("/api/rooms", (req, res) => {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    const hostId = uuidv4();
    db.prepare("INSERT INTO rooms (id, host_id) VALUES (?, ?)").run(id, hostId);
    res.json({ id, hostId });
  });

  app.get("/api/rooms/:id", (req, res) => {
    const room = db.prepare("SELECT * FROM rooms WHERE id = ?").get(req.params.id);
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json(room);
  });

  // WebSocket Logic
  const clients = new Map<string, { ws: WebSocket; roomId: string; playerId: string }>();

  wss.on("connection", (ws) => {
    let clientInfo: { roomId: string; playerId: string } | null = null;

    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());
      const { type, payload } = message;

      switch (type) {
        case "JOIN_ROOM": {
          const { roomId, playerId, realName, isHost } = payload;
          clientInfo = { roomId, playerId };
          clients.set(playerId, { ws, roomId, playerId });

          // Check if player exists, if not create
          const existingPlayer = db.prepare("SELECT * FROM players WHERE id = ?").get(playerId);
          if (!existingPlayer) {
            db.prepare("INSERT INTO players (id, room_id, real_name, is_host) VALUES (?, ?, ?, ?)")
              .run(playerId, roomId, realName, isHost ? 1 : 0);
          }

          broadcastToRoom(roomId, { type: "PLAYER_JOINED", payload: { playerId, realName } });
          sendRoomState(roomId, ws);
          break;
        }

        case "UPDATE_PROFILE": {
          if (!clientInfo) return;
          const { fakeName, age, personality, bio, avatarUrl } = payload;
          db.prepare(`
            UPDATE players 
            SET fake_name = ?, age = ?, personality = ?, bio = ?, avatar_url = ? 
            WHERE id = ?
          `).run(fakeName, age, personality, bio, avatarUrl, clientInfo.playerId);
          
          broadcastToRoom(clientInfo.roomId, { 
            type: "PROFILE_UPDATED", 
            payload: { playerId: clientInfo.playerId, fakeName, avatarUrl } 
          });
          break;
        }

        case "SEND_MESSAGE": {
          if (!clientInfo) return;
          const { content, receiverId, msgType } = payload;
          
          // Check if blocked
          const player = db.prepare("SELECT is_blocked FROM players WHERE id = ?").get(clientInfo.playerId) as any;
          if (player?.is_blocked && msgType !== 'answer') return;

          const room = db.prepare("SELECT round_number, host_id FROM rooms WHERE id = ?").get(clientInfo.roomId) as any;
          const msgId = uuidv4();
          db.prepare("INSERT INTO messages (id, room_id, sender_id, receiver_id, content, type, round_number) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .run(msgId, clientInfo.roomId, clientInfo.playerId, receiverId || null, content, msgType || 'text', room.round_number);

          const msgData = {
            id: msgId,
            senderId: clientInfo.playerId,
            receiverId: receiverId || null,
            content,
            type: msgType || 'text',
            round_number: room.round_number,
            createdAt: new Date().toISOString()
          };

          if (!receiverId) {
            broadcastToRoom(clientInfo.roomId, { type: "NEW_MESSAGE", payload: msgData });
          } else {
            // Private message
            const receiver = clients.get(receiverId);
            if (receiver) receiver.ws.send(JSON.stringify({ type: "NEW_MESSAGE", payload: msgData }));
            ws.send(JSON.stringify({ type: "NEW_MESSAGE", payload: msgData }));

            // Host can see all DMs
            if (room && room.host_id !== clientInfo.playerId && room.host_id !== receiverId) {
              const host = clients.get(room.host_id);
              if (host) host.ws.send(JSON.stringify({ type: "NEW_MESSAGE", payload: { ...msgData, isMonitor: true } }));
            }
          }
          break;
        }

        case "START_VOTING": {
          if (!clientInfo) return;
          db.prepare("UPDATE rooms SET status = 'voting' WHERE id = ?").run(clientInfo.roomId);
          broadcastToRoom(clientInfo.roomId, { type: "VOTING_STARTED" });
          break;
        }

        case "CAST_VOTE": {
          if (!clientInfo) return;
          const { targetId } = payload;
          const voteId = uuidv4();
          db.prepare("INSERT INTO votes (id, room_id, voter_id, target_id) VALUES (?, ?, ?, ?)")
            .run(voteId, clientInfo.roomId, clientInfo.playerId, targetId);
          break;
        }

        case "END_VOTING": {
          if (!clientInfo) return;
          // Calculate results
          const votes = db.prepare("SELECT target_id, COUNT(*) as count FROM votes WHERE room_id = ? GROUP BY target_id ORDER BY count DESC").all(clientInfo.roomId) as any[];
          
          if (votes.length > 0) {
            const mostVoted = votes[0].target_id;
            db.prepare("UPDATE players SET is_blocked = 1 WHERE id = ?").run(mostVoted);
            broadcastToRoom(clientInfo.roomId, { type: "PLAYER_BLOCKED", payload: { playerId: mostVoted } });
          }

          db.prepare("UPDATE rooms SET status = 'playing', round_number = round_number + 1 WHERE id = ?").run(clientInfo.roomId);
          db.prepare("DELETE FROM votes WHERE room_id = ?").run(clientInfo.roomId);
          
          const updatedRoom = db.prepare("SELECT * FROM rooms WHERE id = ?").get(clientInfo.roomId);
          broadcastToRoom(clientInfo.roomId, { type: "VOTING_ENDED", payload: { room: updatedRoom } });
          break;
        }

        case "SET_TIMER": {
          if (!clientInfo) return;
          const { seconds } = payload;
          db.prepare("UPDATE rooms SET timer_left = ?, timer_active = 1 WHERE id = ?").run(seconds, clientInfo.roomId);
          broadcastToRoom(clientInfo.roomId, { type: "TIMER_UPDATED", payload: { seconds, active: 1 } });
          break;
        }

        case "STOP_TIMER": {
          if (!clientInfo) return;
          db.prepare("UPDATE rooms SET timer_active = 0 WHERE id = ?").run(clientInfo.roomId);
          broadcastToRoom(clientInfo.roomId, { type: "TIMER_UPDATED", payload: { active: 0 } });
          break;
        }

        case "TOGGLE_BLOCK": {
          if (!clientInfo) return;
          const { targetId, isBlocked } = payload;
          db.prepare("UPDATE players SET is_blocked = ? WHERE id = ?").run(isBlocked ? 1 : 0, targetId);
          broadcastToRoom(clientInfo.roomId, { type: "BLOCK_STATUS_CHANGED", payload: { playerId: targetId, isBlocked } });
          break;
        }

        case "UPDATE_POINTS": {
          if (!clientInfo) return;
          const { targetId, points } = payload;
          db.prepare("UPDATE players SET points = points + ? WHERE id = ?").run(points, targetId);
          broadcastToRoom(clientInfo.roomId, { type: "POINTS_UPDATED", payload: { playerId: targetId } });
          break;
        }
      }
    });

    ws.on("close", () => {
      if (clientInfo) {
        clients.delete(clientInfo.playerId);
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
  setInterval(() => {
    const activeRooms = db.prepare("SELECT id, timer_left FROM rooms WHERE timer_active = 1 AND timer_left > 0").all() as any[];
    activeRooms.forEach(room => {
      const newTime = room.timer_left - 1;
      if (newTime <= 0) {
        db.prepare("UPDATE rooms SET timer_left = 0, timer_active = 0 WHERE id = ?").run(room.id);
        broadcastToRoom(room.id, { type: "TIMER_FINISHED" });
      } else {
        db.prepare("UPDATE rooms SET timer_left = ? WHERE id = ?").run(newTime, room.id);
        broadcastToRoom(room.id, { type: "TIMER_TICK", payload: { seconds: newTime } });
      }
    });
  }, 1000);

  function sendRoomState(roomId: string, ws: WebSocket) {
    const players = db.prepare("SELECT id, fake_name, age, personality, bio, avatar_url, is_blocked, is_host, points FROM players WHERE room_id = ?").all(roomId);
    const messages = db.prepare("SELECT * FROM messages WHERE room_id = ?").all(roomId);
    const room = db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId);
    
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
