export interface Player {
  id: string;
  room_id: string;
  real_name?: string;
  fake_name: string | null;
  age: number | null;
  personality: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_blocked: number;
  is_host: number;
  points: number;
}

export interface Message {
  id: string;
  room_id: string;
  sender_id: string;
  receiver_id: string | null;
  content: string;
  type: 'text' | 'question' | 'answer';
  created_at: string;
  round_number: number;
  isMonitor?: boolean;
}

export interface Room {
  id: string;
  host_id: string;
  status: 'waiting' | 'playing' | 'voting';
  chat_time: number;
  voting_time: number;
  round_number: number;
  timer_left: number;
  timer_active: number;
}

export type GameState = {
  players: Player[];
  messages: Message[];
  room: Room | null;
  me: Player | null;
};
