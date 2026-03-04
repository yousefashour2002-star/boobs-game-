import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, MessageSquare, Shield, Send, User, 
  Settings, LogOut, Plus, LogIn, Crown, 
  Lock, Eye, EyeOff, AlertCircle, CheckCircle2,
  Trophy, MessageCircle, UserX, UserCheck
} from 'lucide-react';
import { cn } from './lib/utils';
import { Player, Message, Room, GameState } from './types';

const AVATARS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Milo',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Luna',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Jasper',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Sasha',
];

export default function App() {
  const [view, setView] = useState<'landing' | 'profile' | 'game'>('landing');
  const [roomId, setRoomId] = useState('');
  const [playerId, setPlayerId] = useState(() => localStorage.getItem('playerId') || Math.random().toString(36).substring(7));
  const [realName, setRealName] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    messages: [],
    room: null,
    me: null
  });
  const [activeTab, setActiveTab] = useState<'public' | 'private' | 'players' | 'host'>('public');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [showProfileModal, setShowProfileModal] = useState<Player | null>(null);
  
  const ws = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('playerId', playerId);
  }, [playerId]);

  useEffect(() => {
    return () => {
      ws.current?.close();
    };
  }, []);

  const copyRoomCode = () => {
    if (gameState.room?.id) {
      navigator.clipboard.writeText(gameState.room.id);
      alert('Room code copied to clipboard!');
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [gameState.messages, activeTab]);

  const connect = (rId: string, pId: string, name: string, host: boolean) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    
    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: 'JOIN_ROOM',
        payload: { roomId: rId, playerId: pId, realName: name, isHost: host }
      }));
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleWsMessage(data);
    };

    ws.current = socket;
  };

  const handleWsMessage = (msg: any) => {
    const { type, payload } = msg;
    switch (type) {
      case 'ROOM_STATE':
        setGameState(prev => ({
          ...prev,
          players: payload.players,
          messages: payload.messages,
          room: payload.room,
          me: payload.players.find((p: Player) => p.id === playerId) || null
        }));
        if (payload.players.find((p: Player) => p.id === playerId)?.fake_name) {
          setView('game');
        } else {
          setView('profile');
        }
        break;
      case 'PLAYER_JOINED':
        // Handled by room state usually, but can add notification
        break;
      case 'PROFILE_UPDATED':
        setGameState(prev => ({
          ...prev,
          players: prev.players.map(p => p.id === payload.playerId ? { ...p, fake_name: payload.fakeName, avatar_url: payload.avatarUrl } : p)
        }));
        if (payload.playerId === playerId) setView('game');
        break;
      case 'NEW_MESSAGE':
        setGameState(prev => ({
          ...prev,
          messages: [...prev.messages, payload]
        }));
        break;
      case 'VOTING_STARTED':
        setGameState(prev => ({ ...prev, room: prev.room ? { ...prev.room, status: 'voting' } : null }));
        break;
      case 'VOTING_ENDED':
        setGameState(prev => ({ ...prev, room: prev.room ? { ...prev.room, status: 'playing' } : null }));
        break;
      case 'PLAYER_BLOCKED':
      case 'BLOCK_STATUS_CHANGED':
        setGameState(prev => ({
          ...prev,
          players: prev.players.map(p => p.id === payload.playerId ? { ...p, is_blocked: payload.isBlocked !== undefined ? (payload.isBlocked ? 1 : 0) : 1 } : p)
        }));
        break;
      case 'POINTS_UPDATED':
        // Refresh state or just show notification
        break;
    }
  };

  const createRoom = async () => {
    if (!realName) return alert('Please enter your real name');
    const res = await fetch('/api/rooms', { method: 'POST' });
    const data = await res.json();
    setRoomId(data.id);
    setIsHost(true);
    connect(data.id, playerId, realName, true);
  };

  const joinRoom = () => {
    if (!realName || !roomId) return alert('Please enter name and room code');
    connect(roomId.toUpperCase(), playerId, realName, false);
  };

  const updateProfile = (profile: any) => {
    ws.current?.send(JSON.stringify({
      type: 'UPDATE_PROFILE',
      payload: profile
    }));
  };

  const sendMessage = () => {
    if (!messageInput.trim()) return;
    const isPrivate = activeTab === 'private' && selectedPlayerId;
    ws.current?.send(JSON.stringify({
      type: 'SEND_MESSAGE',
      payload: {
        content: messageInput,
        receiverId: isPrivate ? selectedPlayerId : null,
        msgType: 'text'
      }
    }));
    setMessageInput('');
  };

  const castVote = (targetId: string) => {
    ws.current?.send(JSON.stringify({
      type: 'CAST_VOTE',
      payload: { targetId }
    }));
    alert('Vote cast!');
  };

  const startVoting = () => {
    ws.current?.send(JSON.stringify({ type: 'START_VOTING' }));
  };

  const endVoting = () => {
    ws.current?.send(JSON.stringify({ type: 'END_VOTING' }));
  };

  const toggleBlock = (targetId: string, currentStatus: number) => {
    ws.current?.send(JSON.stringify({
      type: 'TOGGLE_BLOCK',
      payload: { targetId, isBlocked: !currentStatus }
    }));
  };

  const awardPoints = (targetId: string, points: number) => {
    ws.current?.send(JSON.stringify({
      type: 'UPDATE_POINTS',
      payload: { targetId, points }
    }));
  };

  const sendQuestion = (targetId: string, content: string) => {
    ws.current?.send(JSON.stringify({
      type: 'SEND_MESSAGE',
      payload: {
        content,
        receiverId: targetId,
        msgType: 'question'
      }
    }));
  };

  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center space-y-2">
            <motion.div 
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="inline-block p-4 bg-indigo-600 rounded-full mb-4 shadow-lg shadow-indigo-500/20"
            >
              <Users size={48} />
            </motion.div>
            <h1 className="text-5xl font-bold tracking-tighter italic">THE CIRCLE</h1>
            <p className="text-zinc-400">Social Deception & Strategy Game</p>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl space-y-6 backdrop-blur-xl">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Your Real Name (Hidden)</label>
                <input 
                  type="text" 
                  value={realName}
                  onChange={(e) => setRealName(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="Enter your real name..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={createRoom}
                  className="flex flex-col items-center justify-center p-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl transition-all group"
                >
                  <Plus className="mb-2 group-hover:scale-110 transition-transform" />
                  <span className="font-semibold">Host Room</span>
                </button>
                <div className="space-y-2">
                  <input 
                    type="text" 
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-2 text-center font-mono focus:outline-none focus:border-indigo-500"
                    placeholder="CODE"
                  />
                  <button 
                    onClick={joinRoom}
                    className="w-full flex items-center justify-center p-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-all"
                  >
                    <LogIn size={18} className="mr-2" />
                    <span className="font-semibold">Join</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'profile') {
    return <ProfileSetup onComplete={updateProfile} />;
  }

  const me = gameState.players.find(p => p.id === playerId);
  const publicMessages = gameState.messages.filter(m => !m.receiver_id && m.type === 'text');
  const privateMessages = gameState.messages.filter(m => 
    (m.receiver_id === playerId || m.sender_id === playerId) && 
    (selectedPlayerId ? (m.receiver_id === selectedPlayerId || m.sender_id === selectedPlayerId) : true)
  );
  
  // Host sees all DMs
  const monitorMessages = gameState.messages.filter(m => m.receiver_id && m.isMonitor);

  return (
    <div className="h-screen bg-[#0a0a0a] text-white flex overflow-hidden font-sans">
      {/* Sidebar */}
      <div className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-900/30">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold italic tracking-tighter">THE CIRCLE</h2>
            <button 
              onClick={copyRoomCode}
              className="text-xs text-zinc-500 font-mono hover:text-indigo-400 transition-colors flex items-center"
            >
              ROOM: {gameState.room?.id}
              <CheckCircle2 size={10} className="ml-1" />
            </button>
          </div>
          {me?.is_host ? <Shield className="text-indigo-500" size={20} /> : <User className="text-zinc-500" size={20} />}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="space-y-2">
            <button 
              onClick={() => setActiveTab('public')}
              className={cn(
                "w-full flex items-center p-3 rounded-xl transition-all",
                activeTab === 'public' ? "bg-indigo-600 text-white" : "hover:bg-zinc-800 text-zinc-400"
              )}
            >
              <MessageSquare size={20} className="mr-3" />
              <span className="font-semibold">Public Chat</span>
            </button>
            <button 
              onClick={() => setActiveTab('private')}
              className={cn(
                "w-full flex items-center p-3 rounded-xl transition-all",
                activeTab === 'private' ? "bg-indigo-600 text-white" : "hover:bg-zinc-800 text-zinc-400"
              )}
            >
              <MessageCircle size={20} className="mr-3" />
              <span className="font-semibold">Private DMs</span>
            </button>
            <button 
              onClick={() => setActiveTab('players')}
              className={cn(
                "w-full flex items-center p-3 rounded-xl transition-all",
                activeTab === 'players' ? "bg-indigo-600 text-white" : "hover:bg-zinc-800 text-zinc-400"
              )}
            >
              <Users size={20} className="mr-3" />
              <span className="font-semibold">Players</span>
            </button>
            {me?.is_host && (
              <button 
                onClick={() => setActiveTab('host')}
                className={cn(
                  "w-full flex items-center p-3 rounded-xl transition-all",
                  activeTab === 'host' ? "bg-amber-600 text-white" : "hover:bg-zinc-800 text-zinc-400"
                )}
              >
                <Crown size={20} className="mr-3" />
                <span className="font-semibold">Host Panel</span>
              </button>
            )}
          </div>

          {activeTab === 'private' && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2">Conversations</p>
              {gameState.players.filter(p => p.id !== playerId).map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlayerId(p.id)}
                  className={cn(
                    "w-full flex items-center p-2 rounded-xl transition-all",
                    selectedPlayerId === p.id ? "bg-zinc-800" : "hover:bg-zinc-800/50"
                  )}
                >
                  <img src={p.avatar_url || ''} className="w-8 h-8 rounded-full mr-3 border border-zinc-700" referrerPolicy="no-referrer" />
                  <div className="text-left">
                    <p className="text-sm font-semibold">{p.fake_name}</p>
                    {p.is_blocked ? <span className="text-[10px] text-red-500 font-bold uppercase">Blocked</span> : <span className="text-[10px] text-green-500 font-bold uppercase">Active</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-zinc-800 bg-black/40">
          <div className="flex items-center space-x-3">
            <img src={me?.avatar_url || ''} className="w-10 h-10 rounded-full border-2 border-indigo-500" referrerPolicy="no-referrer" />
            <div className="flex-1 overflow-hidden">
              <p className="font-bold truncate">{me?.fake_name}</p>
              <p className="text-xs text-zinc-500 truncate">{me?.personality}</p>
            </div>
            <button className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative">
        {/* Header */}
        <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/20">
          <div className="flex items-center space-x-4">
            {activeTab === 'public' && <h3 className="font-bold text-lg">Public Room</h3>}
            {activeTab === 'private' && selectedPlayerId && (
              <div className="flex items-center space-x-3">
                <img 
                  src={gameState.players.find(p => p.id === selectedPlayerId)?.avatar_url || ''} 
                  className="w-8 h-8 rounded-full" 
                  referrerPolicy="no-referrer"
                />
                <h3 className="font-bold text-lg">{gameState.players.find(p => p.id === selectedPlayerId)?.fake_name}</h3>
              </div>
            )}
            {activeTab === 'players' && <h3 className="font-bold text-lg">All Players</h3>}
            {activeTab === 'host' && <h3 className="font-bold text-lg text-amber-500">Host Command Center</h3>}
          </div>

          <div className="flex items-center space-x-4">
            {gameState.room?.status === 'voting' && (
              <div className="flex items-center bg-red-500/10 text-red-500 px-3 py-1 rounded-full border border-red-500/20 animate-pulse">
                <AlertCircle size={16} className="mr-2" />
                <span className="text-xs font-bold uppercase tracking-tighter">Voting in Progress</span>
              </div>
            )}
            <div className="flex items-center bg-indigo-500/10 text-indigo-500 px-3 py-1 rounded-full border border-indigo-500/20">
              <Trophy size={16} className="mr-2" />
              <span className="text-xs font-bold">{me?.points} pts</span>
            </div>
          </div>
        </div>

        {/* Chat / Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === 'players' ? (
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto">
              {gameState.players.map(p => (
                <PlayerCard 
                  key={p.id} 
                  player={p} 
                  isMe={p.id === playerId} 
                  onView={() => setShowProfileModal(p)}
                  onMessage={() => {
                    setSelectedPlayerId(p.id);
                    setActiveTab('private');
                  }}
                  onVote={() => castVote(p.id)}
                  canVote={gameState.room?.status === 'voting' && !me?.is_blocked && p.id !== playerId}
                />
              ))}
            </div>
          ) : activeTab === 'host' ? (
            <HostPanel 
              players={gameState.players}
              messages={monitorMessages}
              onToggleBlock={toggleBlock}
              onAwardPoints={awardPoints}
              onSendQuestion={sendQuestion}
              onStartVoting={startVoting}
              onEndVoting={endVoting}
              roomStatus={gameState.room?.status || 'waiting'}
            />
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
                {(activeTab === 'public' ? publicMessages : privateMessages).map((m) => (
                  <MessageBubble 
                    key={m.id} 
                    message={m} 
                    isMe={m.sender_id === playerId}
                    sender={gameState.players.find(p => p.id === m.sender_id)}
                  />
                ))}
              </div>

              {/* Input Area */}
              <div className="p-6 border-t border-zinc-800 bg-zinc-900/10">
                {me?.is_blocked ? (
                  <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center justify-center text-red-500">
                    <EyeOff size={20} className="mr-3" />
                    <span className="font-semibold">You are blocked and cannot send messages.</span>
                  </div>
                ) : (
                  <div className="relative">
                    <input 
                      type="text"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder={activeTab === 'public' ? "Message everyone..." : "Send a private message..."}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 pr-16 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                    <button 
                      onClick={sendMessage}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all"
                    >
                      <Send size={20} />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Profile Modal */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="relative h-48 bg-gradient-to-br from-indigo-600 to-purple-700">
                <button 
                  onClick={() => setShowProfileModal(null)}
                  className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 rounded-full transition-all"
                >
                  <LogOut size={20} />
                </button>
                <div className="absolute -bottom-12 left-8">
                  <img 
                    src={showProfileModal.avatar_url || ''} 
                    className="w-32 h-32 rounded-3xl border-4 border-zinc-900 shadow-xl" 
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
              <div className="pt-16 p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold">{showProfileModal.fake_name}</h2>
                    <p className="text-indigo-400 font-semibold">{showProfileModal.personality} • {showProfileModal.age} years old</p>
                  </div>
                  {showProfileModal.is_blocked ? (
                    <div className="bg-red-500/20 text-red-500 px-4 py-1 rounded-full border border-red-500/30 text-xs font-bold uppercase">Blocked</div>
                  ) : (
                    <div className="bg-green-500/20 text-green-500 px-4 py-1 rounded-full border border-green-500/30 text-xs font-bold uppercase">Active</div>
                  )}
                </div>
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Biography</h4>
                  <p className="text-zinc-300 leading-relaxed">{showProfileModal.bio}</p>
                </div>
                <div className="pt-4 flex space-x-4">
                  <button 
                    onClick={() => {
                      setSelectedPlayerId(showProfileModal.id);
                      setActiveTab('private');
                      setShowProfileModal(null);
                    }}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 py-3 rounded-xl font-bold transition-all flex items-center justify-center"
                  >
                    <MessageCircle size={20} className="mr-2" />
                    Send Message
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProfileSetup({ onComplete }: { onComplete: (p: any) => void }) {
  const [fakeName, setFakeName] = useState('');
  const [age, setAge] = useState(25);
  const [personality, setPersonality] = useState('Social');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(AVATARS[0]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4">
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="max-w-2xl w-full bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl"
      >
        <div className="p-8 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-3xl font-bold italic tracking-tighter">CREATE YOUR IDENTITY</h2>
          <p className="text-zinc-500">This profile will be permanent. Choose wisely.</p>
        </div>
        
        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Fake Name</label>
              <input 
                type="text" 
                value={fakeName}
                onChange={(e) => setFakeName(e.target.value)}
                className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                placeholder="e.g. Alex"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Age</label>
                <input 
                  type="number" 
                  value={age}
                  onChange={(e) => setAge(parseInt(e.target.value))}
                  className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Personality</label>
                <select 
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                >
                  <option>Social</option>
                  <option>Mysterious</option>
                  <option>Aggressive</option>
                  <option>Friendly</option>
                  <option>Sarcastic</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Bio / Story</label>
              <textarea 
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 h-32 focus:outline-none focus:border-indigo-500 resize-none"
                placeholder="Tell your fake story..."
              />
            </div>
          </div>

          <div className="space-y-6">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Choose Avatar</label>
            <div className="grid grid-cols-3 gap-4">
              {AVATARS.map(url => (
                <button 
                  key={url}
                  onClick={() => setAvatarUrl(url)}
                  className={cn(
                    "p-2 rounded-2xl border-2 transition-all",
                    avatarUrl === url ? "border-indigo-500 bg-indigo-500/10" : "border-transparent hover:bg-zinc-800"
                  )}
                >
                  <img src={url} className="w-full aspect-square rounded-xl" referrerPolicy="no-referrer" />
                </button>
              ))}
            </div>
            <div className="pt-8">
              <button 
                onClick={() => onComplete({ fakeName, age, personality, bio, avatarUrl })}
                disabled={!fakeName || !bio}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed py-4 rounded-2xl font-bold text-lg transition-all shadow-lg shadow-indigo-500/20"
              >
                Enter The Circle
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

interface MessageBubbleProps {
  key?: React.Key;
  message: Message;
  isMe: boolean;
  sender?: Player;
}

function MessageBubble({ message, isMe, sender }: MessageBubbleProps) {
  return (
    <div className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
      <div className={cn("flex items-end space-x-2", isMe && "flex-row-reverse space-x-reverse")}>
        {!isMe && <img src={sender?.avatar_url || ''} className="w-8 h-8 rounded-full mb-1" referrerPolicy="no-referrer" />}
        <div className={cn(
          "max-w-md px-4 py-3 rounded-2xl text-sm shadow-sm",
          isMe ? "bg-indigo-600 text-white rounded-br-none" : "bg-zinc-800 text-zinc-100 rounded-bl-none",
          message.type === 'question' && "bg-amber-600/20 border border-amber-500/30 text-amber-200"
        )}>
          {message.type === 'question' && <p className="text-[10px] font-bold uppercase mb-1 opacity-60 flex items-center"><Lock size={10} className="mr-1" /> Host Question</p>}
          {message.content}
        </div>
      </div>
      <span className="text-[10px] text-zinc-600 mt-1 px-2">
        {isMe ? 'You' : sender?.fake_name} • {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
}

interface PlayerCardProps {
  key?: React.Key;
  player: Player;
  isMe: boolean;
  onView: () => void;
  onMessage: () => void;
  onVote: () => void;
  canVote: boolean;
}

function PlayerCard({ player, isMe, onView, onMessage, onVote, canVote }: PlayerCardProps) {
  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden group"
    >
      <div className="p-6 flex flex-col items-center text-center space-y-4">
        <div className="relative">
          <img 
            src={player.avatar_url || ''} 
            className={cn("w-24 h-24 rounded-2xl border-2 border-zinc-800 group-hover:border-indigo-500 transition-all", player.is_blocked && "grayscale opacity-50")} 
            referrerPolicy="no-referrer"
          />
          {player.is_blocked && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded rotate-[-15deg] shadow-lg">BLOCKED</div>
            </div>
          )}
        </div>
        <div>
          <h4 className="font-bold text-lg">{player.fake_name} {isMe && <span className="text-xs text-zinc-500">(You)</span>}</h4>
          <p className="text-xs text-zinc-500">{player.personality}</p>
        </div>
        <div className="flex w-full gap-2">
          <button 
            onClick={onView}
            className="flex-1 p-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-all"
          >
            <User size={18} className="mx-auto" />
          </button>
          {!isMe && (
            <button 
              onClick={onMessage}
              className="flex-1 p-2 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 rounded-xl transition-all"
            >
              <MessageSquare size={18} className="mx-auto" />
            </button>
          )}
        </div>
        {canVote && (
          <button 
            onClick={onVote}
            className="w-full py-2 bg-red-600 hover:bg-red-500 rounded-xl font-bold text-sm transition-all"
          >
            Vote to Block
          </button>
        )}
      </div>
    </motion.div>
  );
}

function HostPanel({ 
  players, messages, onToggleBlock, onAwardPoints, onSendQuestion, onStartVoting, onEndVoting, roomStatus 
}: { 
  players: Player[], messages: Message[], onToggleBlock: (id: string, s: number) => void, 
  onAwardPoints: (id: string, p: number) => void, onSendQuestion: (id: string, c: string) => void,
  onStartVoting: () => void, onEndVoting: () => void, roomStatus: string
}) {
  const [questionInput, setQuestionInput] = useState('');
  const [selectedForQuestion, setSelectedForQuestion] = useState<string[]>([]);

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8">
      {/* Game Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl space-y-4">
          <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center">
            <Settings size={16} className="mr-2" /> Game Flow Control
          </h4>
          <div className="flex gap-4">
            {roomStatus === 'playing' ? (
              <button 
                onClick={onStartVoting}
                className="flex-1 bg-red-600 hover:bg-red-500 py-3 rounded-xl font-bold transition-all"
              >
                Start Voting Phase
              </button>
            ) : (
              <button 
                onClick={onEndVoting}
                className="flex-1 bg-green-600 hover:bg-green-500 py-3 rounded-xl font-bold transition-all"
              >
                End Voting & Block
              </button>
            )}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl space-y-4">
          <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center">
            <MessageCircle size={16} className="mr-2" /> Send Private Question
          </h4>
          <div className="space-y-3">
            <input 
              type="text" 
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-2 focus:outline-none focus:border-amber-500"
              placeholder="Type a question for players..."
            />
            <div className="flex gap-2 overflow-x-auto pb-2">
              {players.filter(p => !p.is_host).map(p => (
                <button 
                  key={p.id}
                  onClick={() => setSelectedForQuestion(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id])}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap",
                    selectedForQuestion.includes(p.id) ? "bg-amber-600 text-white" : "bg-zinc-800 text-zinc-500"
                  )}
                >
                  {p.fake_name}
                </button>
              ))}
            </div>
            <button 
              onClick={() => {
                selectedForQuestion.forEach(id => onSendQuestion(id, questionInput));
                setQuestionInput('');
                setSelectedForQuestion([]);
              }}
              className="w-full bg-amber-600 hover:bg-amber-500 py-2 rounded-xl font-bold transition-all"
            >
              Send to Selected
            </button>
          </div>
        </div>
      </div>

      {/* Player Management */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
        <div className="p-6 border-b border-zinc-800">
          <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Player Management</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-black/20 text-xs text-zinc-500 uppercase font-bold">
              <tr>
                <th className="px-6 py-4">Player</th>
                <th className="px-6 py-4">Real Name</th>
                <th className="px-6 py-4">Points</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {players.filter(p => !p.is_host).map(p => (
                <tr key={p.id} className="hover:bg-zinc-800/20 transition-all">
                  <td className="px-6 py-4 flex items-center space-x-3">
                    <img src={p.avatar_url || ''} className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                    <span className="font-bold">{p.fake_name}</span>
                  </td>
                  <td className="px-6 py-4 text-zinc-400 font-mono text-xs">{p.real_name || 'Unknown'}</td>
                  <td className="px-6 py-4 font-bold text-indigo-400">{p.points}</td>
                  <td className="px-6 py-4">
                    {p.is_blocked ? (
                      <span className="text-red-500 text-[10px] font-bold uppercase bg-red-500/10 px-2 py-1 rounded">Blocked</span>
                    ) : (
                      <span className="text-green-500 text-[10px] font-bold uppercase bg-green-500/10 px-2 py-1 rounded">Active</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => onToggleBlock(p.id, p.is_blocked)}
                        className={cn("p-2 rounded-lg transition-all", p.is_blocked ? "bg-green-600/20 text-green-500" : "bg-red-600/20 text-red-500")}
                      >
                        {p.is_blocked ? <UserCheck size={16} /> : <UserX size={16} />}
                      </button>
                      <button 
                        onClick={() => onAwardPoints(p.id, 10)}
                        className="p-2 bg-indigo-600/20 text-indigo-500 rounded-lg hover:bg-indigo-600/30"
                      >
                        +10
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* DM Monitor */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center">
            <Eye size={16} className="mr-2" /> Private DM Monitor (Host Only)
          </h4>
          <span className="text-[10px] bg-amber-500/10 text-amber-500 px-2 py-1 rounded font-bold uppercase">Live Feed</span>
        </div>
        <div className="p-6 h-64 overflow-y-auto space-y-3 bg-black/20">
          {messages.length === 0 ? (
            <p className="text-center text-zinc-600 text-sm italic py-12">No private messages intercepted yet...</p>
          ) : (
            messages.map(m => (
              <div key={m.id} className="text-xs bg-zinc-800/50 p-3 rounded-xl border border-zinc-800">
                <div className="flex justify-between mb-1">
                  <span className="font-bold text-indigo-400">
                    {players.find(p => p.id === m.sender_id)?.fake_name} → {players.find(p => p.id === m.receiver_id)?.fake_name}
                  </span>
                  <span className="text-zinc-600">{new Date(m.created_at).toLocaleTimeString()}</span>
                </div>
                <p className="text-zinc-300">{m.content}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
