import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import multer from "multer";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite database
const db = new Database("database.db");

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
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

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL,
    status TEXT DEFAULT 'waiting',
    chat_time INTEGER DEFAULT 300,
    voting_time INTEGER DEFAULT 60,
    round_number INTEGER DEFAULT 1,
    timer_left INTEGER DEFAULT 0,
    timer_active INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    receiver_id TEXT,
    content TEXT,
    type TEXT DEFAULT 'text',
    round_number INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS votes (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    voter_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    round_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Helper functions for database operations
const dbOps = {
  players: {
    findOne: (query: any) => {
      const keys = Object.keys(query);
      const where = keys.map(k => `${k} = ?`).join(' AND ');
      return db.prepare(`SELECT * FROM players WHERE ${where}`).get(...Object.values(query));
    },
    find: (query: any) => {
      const keys = Object.keys(query);
      const where = keys.map(k => `${k} = ?`).join(' AND ');
      return db.prepare(`SELECT * FROM players WHERE ${where}`).all(...Object.values(query));
    },
    create: (data: any) => {
      const keys = Object.keys(data);
      const placeholders = keys.map(() => '?').join(', ');
      return db.prepare(`INSERT INTO players (${keys.join(', ')}) VALUES (${placeholders})`).run(...Object.values(data));
    },
    update: (query: any, data: any) => {
      const qKeys = Object.keys(query);
      const qWhere = qKeys.map(k => `${k} = ?`).join(' AND ');
      const dKeys = Object.keys(data);
      const dSet = dKeys.map(k => {
        if (typeof data[k] === 'object' && data[k].$inc) {
          return `${k} = ${k} + ?`;
        }
        return `${k} = ?`;
      }).join(', ');
      
      const values = dKeys.map(k => {
        if (typeof data[k] === 'object' && data[k].$inc) {
          return data[k].$inc;
        }
        return data[k];
      });
      
      return db.prepare(`UPDATE players SET ${dSet} WHERE ${qWhere}`).run(...values, ...Object.values(query));
    },
    deleteMany: (query: any) => {
      const keys = Object.keys(query);
      const where = keys.map(k => `${k} = ?`).join(' AND ');
      return db.prepare(`DELETE FROM players WHERE ${where}`).run(...Object.values(query));
    }
  },
  rooms: {
    findOne: (query: any) => {
      const keys = Object.keys(query);
      const where = keys.map(k => `${k} = ?`).join(' AND ');
      return db.prepare(`SELECT * FROM rooms WHERE ${where}`).get(...Object.values(query));
    },
    find: (query: any) => {
      const keys = Object.keys(query);
      const where = keys.map(k => `${k} = ?`).join(' AND ');
      return db.prepare(`SELECT * FROM rooms WHERE ${where}`).all(...Object.values(query));
    },
    create: (data: any) => {
      const keys = Object.keys(data);
      const placeholders = keys.map(() => '?').join(', ');
      return db.prepare(`INSERT INTO rooms (${keys.join(', ')}) VALUES (${placeholders})`).run(...Object.values(data));
    },
    update: (query: any, data: any) => {
      const qKeys = Object.keys(query);
      const qWhere = qKeys.map(k => `${k} = ?`).join(' AND ');
      const dKeys = Object.keys(data);
      const dSet = dKeys.map(k => {
        if (typeof data[k] === 'object' && data[k].$inc) {
          return `${k} = ${k} + ?`;
        }
        return `${k} = ?`;
      }).join(', ');
      
      const values = dKeys.map(k => {
        if (typeof data[k] === 'object' && data[k].$inc) {
          return data[k].$inc;
        }
        return data[k];
      });
      
      return db.prepare(`UPDATE rooms SET ${dSet} WHERE ${qWhere}`).run(...values, ...Object.values(query));
    },
    deleteOne: (query: any) => {
      const keys = Object.keys(query);
      const where = keys.map(k => `${k} = ?`).join(' AND ');
      return db.prepare(`DELETE FROM rooms WHERE ${where} LIMIT 1`).run(...Object.values(query));
    }
  },
  messages: {
    find: (query: any) => {
      const keys = Object.keys(query);
      const where = keys.map(k => `${k} = ?`).join(' AND ');
      return db.prepare(`SELECT * FROM messages WHERE ${where} ORDER BY created_at ASC`).all(...Object.values(query));
    },
    create: (data: any) => {
      const keys = Object.keys(data);
      const placeholders = keys.map(() => '?').join(', ');
      return db.prepare(`INSERT INTO messages (${keys.join(', ')}) VALUES (${placeholders})`).run(...Object.values(data));
    },
    deleteMany: (query: any) => {
      const keys = Object.keys(query);
      const where = keys.map(k => `${k} = ?`).join(' AND ');
      return db.prepare(`DELETE FROM messages WHERE ${where}`).run(...Object.values(query));
    }
  },
  votes: {
    create: (data: any) => {
      const keys = Object.keys(data);
      const placeholders = keys.map(() => '?').join(', ');
      return db.prepare(`INSERT INTO votes (${keys.join(', ')}) VALUES (${placeholders})`).run(...Object.values(data));
    },
    getVoteCounts: (roomId: string) => {
      return db.prepare(`SELECT target_id as _id, COUNT(*) as count FROM votes WHERE room_id = ? GROUP BY target_id ORDER BY count DESC`).all(roomId);
    },
    deleteMany: (query: any) => {
      const keys = Object.keys(query);
      const where = keys.map(k => `${k} = ?`).join(' AND ');
      return db.prepare(`DELETE FROM votes WHERE ${where}`).run(...Object.values(query));
    }
  }
};

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
    dbOps.rooms.create({ id, host_id: hostId });
    res.json({ id, hostId });
  });

  app.get("/api/rooms/:id", async (req, res) => {
    const room = dbOps.rooms.findOne({ id: req.params.id });
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

          // Check if player exists, if not create, otherwise update room_id
          let player = dbOps.players.findOne({ id: playerId });
          if (!player) {
            dbOps.players.create({ id: playerId, room_id: roomId, real_name: realName, is_host: isHost ? 1 : 0 });
          } else {
            dbOps.players.update({ id: playerId }, { room_id: roomId, is_host: isHost ? 1 : 0, real_name: realName });
          }

          broadcastToRoom(roomId, { type: "PLAYER_JOINED", payload: { playerId, realName } });
          broadcastRoomState(roomId);
          break;
        }

        case "UPDATE_PROFILE": {
          if (!clientInfo) return;
          const { fakeName, age, personality, bio, avatarUrl } = payload;
          dbOps.players.update(
            { id: clientInfo.playerId },
            { fake_name: fakeName, age, personality, bio, avatar_url: avatarUrl }
          );
          
          broadcastToRoom(clientInfo.roomId, { 
            type: "PROFILE_UPDATED", 
            payload: { playerId: clientInfo.playerId, fakeName, avatarUrl } 
          });
          broadcastRoomState(clientInfo.roomId);
          break;
        }

        case "SEND_MESSAGE": {
          if (!clientInfo) return;
          const { content, receiverId, msgType } = payload;
          
          const player = dbOps.players.findOne({ id: clientInfo.playerId });
          if (player?.is_blocked && (msgType === 'text' || msgType === 'answer')) return;

          const room = dbOps.rooms.findOne({ id: clientInfo.roomId });
          if (!room) return;

          const msgId = uuidv4();
          const createdAt = new Date().toISOString();
          dbOps.messages.create({
            id: msgId,
            room_id: clientInfo.roomId,
            sender_id: clientInfo.playerId,
            receiver_id: receiverId || null,
            content,
            type: msgType || 'text',
            round_number: room.round_number,
            created_at: createdAt
          });

          const msgData = {
            id: msgId,
            sender_id: clientInfo.playerId,
            receiver_id: receiverId || null,
            content,
            type: msgType || 'text',
            round_number: room.round_number,
            created_at: createdAt
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
          dbOps.rooms.update({ id: clientInfo.roomId }, { status: 'voting' });
          broadcastToRoom(clientInfo.roomId, { type: "VOTING_STARTED" });
          break;
        }

        case "CAST_VOTE": {
          if (!clientInfo) return;
          const player = dbOps.players.findOne({ id: clientInfo.playerId });
          if (!player || player.is_host !== 1) return; // Only host can vote

          const { targetId } = payload;
          const voteId = uuidv4();
          dbOps.votes.create({ id: voteId, room_id: clientInfo.roomId, voter_id: clientInfo.playerId, target_id: targetId });
          break;
        }

        case "END_VOTING": {
          if (!clientInfo) return;
          const votes = dbOps.votes.getVoteCounts(clientInfo.roomId) as any[];
          
          if (votes.length > 0) {
            const mostVoted = votes[0]._id;
            dbOps.players.update({ id: mostVoted }, { is_blocked: 1 });
            broadcastToRoom(clientInfo.roomId, { type: "PLAYER_BLOCKED", payload: { playerId: mostVoted } });
          }

          const room = dbOps.rooms.findOne({ id: clientInfo.roomId });
          const nextRound = (room.round_number || 1) + 1;
          
          dbOps.rooms.update(
            { id: clientInfo.roomId },
            { status: 'playing', round_number: nextRound }
          );
          
          const updatedRoom = dbOps.rooms.findOne({ id: clientInfo.roomId });
          dbOps.votes.deleteMany({ room_id: clientInfo.roomId });
          broadcastToRoom(clientInfo.roomId, { type: "VOTING_ENDED", payload: { room: updatedRoom } });
          broadcastRoomState(clientInfo.roomId);
          break;
        }

        case "SET_TIMER": {
          if (!clientInfo) return;
          const { seconds } = payload;
          dbOps.rooms.update({ id: clientInfo.roomId }, { timer_left: seconds, timer_active: 1 });
          broadcastToRoom(clientInfo.roomId, { type: "TIMER_UPDATED", payload: { seconds, active: 1 } });
          break;
        }

        case "STOP_TIMER": {
          if (!clientInfo) return;
          dbOps.rooms.update({ id: clientInfo.roomId }, { timer_active: 0 });
          broadcastToRoom(clientInfo.roomId, { type: "TIMER_UPDATED", payload: { active: 0 } });
          break;
        }

        case "TOGGLE_BLOCK": {
          if (!clientInfo) return;
          const { targetId, isBlocked } = payload;
          dbOps.players.update({ id: targetId }, { is_blocked: isBlocked ? 1 : 0 });
          broadcastToRoom(clientInfo.roomId, { type: "BLOCK_STATUS_CHANGED", payload: { playerId: targetId, isBlocked } });
          broadcastRoomState(clientInfo.roomId);
          break;
        }

        case "UPDATE_POINTS": {
          if (!clientInfo) return;
          const { targetId, points } = payload;
          dbOps.players.update({ id: targetId }, { points: { $inc: points } as any });
          broadcastToRoom(clientInfo.roomId, { type: "POINTS_UPDATED", payload: { playerId: targetId } });
          broadcastRoomState(clientInfo.roomId);
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
          dbOps.rooms.deleteOne({ id: clientInfo.roomId });
          dbOps.players.deleteMany({ room_id: clientInfo.roomId });
          // We keep messages for persistence as requested
          dbOps.votes.deleteMany({ room_id: clientInfo.roomId });
        } else {
          broadcastRoomState(clientInfo.roomId);
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
    const activeRooms = dbOps.rooms.find({ timer_active: 1 }) as any[];
    for (const room of activeRooms) {
      if (room.timer_left <= 0) continue;
      
      const newTime = room.timer_left - 1;
      if (newTime <= 0) {
        dbOps.rooms.update({ id: room.id }, { timer_left: 0, timer_active: 0 });
        broadcastToRoom(room.id, { type: "TIMER_FINISHED" });
      } else {
        dbOps.rooms.update({ id: room.id }, { timer_left: newTime });
        broadcastToRoom(room.id, { type: "TIMER_TICK", payload: { seconds: newTime } });
      }
    }
  }, 1000);

  async function sendRoomState(roomId: string, ws: WebSocket) {
    const players = dbOps.players.find({ room_id: roomId });
    const messages = dbOps.messages.find({ room_id: roomId });
    const room = dbOps.rooms.findOne({ id: roomId });
    
    ws.send(JSON.stringify({
      type: "ROOM_STATE",
      payload: { players, messages, room }
    }));
  }

  async function broadcastRoomState(roomId: string) {
    const players = dbOps.players.find({ room_id: roomId });
    const messages = dbOps.messages.find({ room_id: roomId });
    const room = dbOps.rooms.findOne({ id: roomId });
    broadcastToRoom(roomId, {
      type: "ROOM_STATE",
      payload: { players, messages, room }
    });
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  const PORT = 3000;

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
