import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, MessageSquare, Shield, Send, User, 
  Settings, LogOut, Plus, LogIn, Crown, 
  Lock, Eye, EyeOff, AlertCircle, CheckCircle2,
  Trophy, MessageCircle, UserX, UserCheck, Copy,
  Menu, X
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
    const savedRoomId = localStorage.getItem('roomId');
    const savedRealName = localStorage.getItem('realName');
    const savedIsHost = localStorage.getItem('isHost') === 'true';
    
    if (savedRoomId && savedRealName) {
      setRoomId(savedRoomId);
      setRealName(savedRealName);
      setIsHost(savedIsHost);
      // We will connect in a separate useEffect once states are set
    }
  }, []);

  useEffect(() => {
    if (roomId && realName && !ws.current) {
      connect(roomId, playerId, realName, isHost);
    }
  }, [roomId, realName, isHost]);

  useEffect(() => {
    localStorage.setItem('playerId', playerId);
    if (roomId) localStorage.setItem('roomId', roomId);
    if (realName) localStorage.setItem('realName', realName);
    localStorage.setItem('isHost', isHost.toString());
  }, [playerId, roomId, realName, isHost]);

  useEffect(() => {
    return () => {
      ws.current?.close();
    };
  }, []);

  const [copied, setCopied] = useState(false);

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
        setGameState(prev => ({ ...prev, room: payload.room }));
        break;
      case 'PLAYER_BLOCKED':
      case 'BLOCK_STATUS_CHANGED':
        setGameState(prev => ({
          ...prev,
          players: prev.players.map(p => p.id === payload.playerId ? { ...p, is_blocked: payload.isBlocked !== undefined ? (payload.isBlocked ? 1 : 0) : 1 } : p)
        }));
        break;
      case 'TIMER_TICK':
        setGameState(prev => ({ ...prev, room: prev.room ? { ...prev.room, timer_left: payload.seconds, timer_active: 1 } : null }));
        break;
      case 'TIMER_UPDATED':
        setGameState(prev => ({ ...prev, room: prev.room ? { ...prev.room, timer_left: payload.seconds ?? prev.room.timer_left, timer_active: payload.active } : null }));
        break;
      case 'TIMER_FINISHED':
        setGameState(prev => ({ ...prev, room: prev.room ? { ...prev.room, timer_left: 0, timer_active: 0 } : null }));
        break;
      case 'POINTS_UPDATED':
        // Refresh state or just show notification
        break;
    }
  };

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

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const copyRoomCode = () => {
    if (gameState.room?.id) {
      const text = gameState.room.id;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }).catch(() => {
          // Fallback if clipboard API fails
          fallbackCopyText(text);
        });
      } else {
        fallbackCopyText(text);
      }
    }
  };

  const fallbackCopyText = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Ensure it's not visible but part of the DOM
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Fallback copy failed', err);
    }
    
    document.body.removeChild(textArea);
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
    
    if (activeTab === 'private' && !selectedPlayerId) {
      alert('Please select a player to send a private message.');
      return;
    }

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

  const setTimer = (seconds: number) => {
    ws.current?.send(JSON.stringify({ type: 'SET_TIMER', payload: { seconds } }));
  };

  const stopTimer = () => {
    ws.current?.send(JSON.stringify({ type: 'STOP_TIMER' }));
  };

  const me = gameState.players.find(p => p.id === playerId);
  const currentRound = gameState.room?.round_number || 1;

  useEffect(() => {
    if (scrollRef.current) {
      // If it's public chat and user is not host, force scroll to bottom to prevent "scrolling up"
      if (activeTab === 'public' && !me?.is_host) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      } else {
        // Normal auto-scroll for others/private
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [gameState.messages, activeTab, me?.is_host]);

  // Prevent manual scrolling up for players in public chat
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || activeTab !== 'public' || me?.is_host) return;

    const handleScroll = () => {
      // If user tries to scroll up more than 50px from bottom, snap back
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      if (!isAtBottom) {
        el.scrollTop = el.scrollHeight - el.clientHeight;
      }
    };

    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [activeTab, me?.is_host, gameState.messages.length]);

  const publicMessages = gameState.messages.filter(m => {
    // Strictly exclude any message with a receiver_id (private messages)
    if (m.receiver_id !== null && m.receiver_id !== undefined && m.receiver_id !== '') return false;
    
    // Only text, questions, and answers in public chat
    if (!['text', 'question', 'answer'].includes(m.type)) return false;
    
    // Host sees all public messages, players only see current round
    if (me?.is_host) return true;
    return m.round_number === currentRound;
  });

  const privateMessages = gameState.messages.filter(m => 
    (m.receiver_id === playerId || m.sender_id === playerId) && 
    (selectedPlayerId ? (m.receiver_id === selectedPlayerId || m.sender_id === selectedPlayerId) : true)
  );
  
  // Players I have messaged
  const messagedPlayerIds = new Set(
    gameState.messages
      .filter(m => m.receiver_id && (m.sender_id === playerId || m.receiver_id === playerId))
      .map(m => m.sender_id === playerId ? m.receiver_id : m.sender_id)
  );

  const monitorMessages = gameState.messages.filter(m => 
    m.receiver_id && 
    m.receiver_id !== gameState.room?.host_id && 
    m.sender_id !== gameState.room?.host_id
  );
  const playerAnswers = gameState.messages.filter(m => m.type === 'answer');

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
            <h1 className="text-4xl md:text-5xl font-bold tracking-tighter italic">THE CIRCLE</h1>
            <p className="text-zinc-400 text-sm md:text-base">Social Deception & Strategy Game</p>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 p-6 md:p-8 rounded-3xl space-y-6 backdrop-blur-xl">
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

  return (
    <div className="h-screen bg-[#0a0a0a] text-white flex overflow-hidden font-sans relative">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-80 border-r border-zinc-800 flex flex-col bg-zinc-900 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 md:bg-zinc-900/30",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold italic tracking-tighter">THE CIRCLE</h2>
            <div className="flex items-center space-x-2">
              <span 
                className="text-xs text-zinc-500 font-mono uppercase cursor-pointer hover:text-indigo-400 transition-all"
                onClick={copyRoomCode}
                title="Click to copy"
              >
                ROOM: {gameState.room?.id}
              </span>
              <button 
                onClick={copyRoomCode}
                className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-indigo-400 transition-all relative"
                title="Copy Room Code"
              >
                {copied ? <CheckCircle2 size={12} className="text-emerald-500" /> : <Copy size={12} />}
                {copied && (
                  <motion.span 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded font-bold"
                  >
                    COPIED
                  </motion.span>
                )}
              </button>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {me?.is_host ? <Shield className="text-indigo-500" size={20} /> : <User className="text-zinc-500" size={20} />}
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 md:hidden"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="space-y-2">
            <button 
              onClick={() => { setActiveTab('public'); setIsSidebarOpen(false); }}
              className={cn(
                "w-full flex items-center p-3 rounded-xl transition-all",
                activeTab === 'public' ? "bg-indigo-600 text-white" : "hover:bg-zinc-800 text-zinc-400"
              )}
            >
              <MessageSquare size={20} className="mr-3" />
              <span className="font-semibold">Public Chat</span>
            </button>
            <button 
              onClick={() => { setActiveTab('private'); setIsSidebarOpen(false); }}
              className={cn(
                "w-full flex items-center p-3 rounded-xl transition-all",
                activeTab === 'private' ? "bg-indigo-600 text-white" : "hover:bg-zinc-800 text-zinc-400"
              )}
            >
              <MessageCircle size={20} className="mr-3" />
              <span className="font-semibold">Private DMs</span>
            </button>
            <button 
              onClick={() => { setActiveTab('players'); setIsSidebarOpen(false); }}
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
                onClick={() => { setActiveTab('host'); setIsSidebarOpen(false); }}
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
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2">Recent Chats</p>
              {gameState.players
                .filter(p => p.id !== playerId)
                .map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPlayerId(p.id); setIsSidebarOpen(false); }}
                  className={cn(
                    "w-full flex items-center p-2 rounded-xl transition-all",
                    selectedPlayerId === p.id ? "bg-indigo-600/20 border border-indigo-500/30" : "hover:bg-zinc-800/50 border border-transparent"
                  )}
                >
                  <div className="relative">
                    <img src={p.avatar_url || ''} className="w-10 h-10 rounded-full mr-3 border border-zinc-700 object-cover" referrerPolicy="no-referrer" />
                    {messagedPlayerIds.has(p.id) && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full border-2 border-zinc-900" />
                    )}
                  </div>
                  <div className="text-left overflow-hidden">
                    <p className="text-sm font-bold truncate">{p.fake_name}</p>
                    {p.is_blocked ? (
                      <span className="text-[10px] text-red-500 font-bold uppercase">Blocked</span>
                    ) : (
                      <span className="text-[10px] text-zinc-500 font-medium">{p.personality}</span>
                    )}
                  </div>
                </button>
              ))}
              {gameState.players.filter(p => p.id !== playerId).length === 0 && (
                <p className="text-[10px] text-zinc-600 italic px-2">Waiting for players to join...</p>
              )}
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
        <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-4 md:px-6 bg-zinc-900/20">
          <div className="flex items-center space-x-3 md:space-x-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 md:hidden"
            >
              <Menu size={20} />
            </button>
            {activeTab === 'public' && <h3 className="font-bold text-sm md:text-lg">Public Room</h3>}
            {activeTab === 'private' && selectedPlayerId && (
              <div className="flex items-center space-x-2 md:space-x-3">
                <img 
                  src={gameState.players.find(p => p.id === selectedPlayerId)?.avatar_url || ''} 
                  className="w-6 h-6 md:w-8 md:h-8 rounded-full" 
                  referrerPolicy="no-referrer"
                />
                <h3 className="font-bold text-sm md:text-lg truncate max-w-[100px] md:max-w-none">
                  {gameState.players.find(p => p.id === selectedPlayerId)?.fake_name}
                </h3>
              </div>
            )}
            {activeTab === 'players' && <h3 className="font-bold text-sm md:text-lg">All Players</h3>}
            {activeTab === 'host' && <h3 className="font-bold text-sm md:text-lg text-amber-500">Host Center</h3>}
          </div>

          <div className="flex items-center space-x-2 md:space-x-4">
            {gameState.room?.timer_active === 1 && (
              <div className="flex items-center bg-zinc-800 px-2 md:px-3 py-1 rounded-full border border-zinc-700">
                <Settings size={12} className="mr-1 md:mr-2 text-zinc-500 animate-spin" />
                <span className="text-[10px] md:text-xs font-mono font-bold">
                  {Math.floor(gameState.room.timer_left / 60)}:{(gameState.room.timer_left % 60).toString().padStart(2, '0')}
                </span>
              </div>
            )}
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
            <div className="p-4 md:p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 overflow-y-auto">
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
                  canVote={gameState.room?.status === 'voting' && me?.is_host === 1 && p.id !== playerId}
                />
              ))}
            </div>
          ) : activeTab === 'private' && !selectedPlayerId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-500">
                <MessageCircle size={40} />
              </div>
              <div className="max-w-xs">
                <h3 className="text-xl font-bold">Private Messages</h3>
                <p className="text-zinc-500 mt-2">Select a player from the sidebar to start a private conversation.</p>
              </div>
            </div>
          ) : activeTab === 'host' ? (
            <HostPanel 
              players={gameState.players}
              messages={monitorMessages}
              answers={playerAnswers}
              onToggleBlock={toggleBlock}
              onAwardPoints={awardPoints}
              onSendQuestion={(content) => {
                // Send to all players
                gameState.players.filter(p => !p.is_host).forEach(p => {
                  sendQuestion(p.id, content);
                });
              }}
              onStartVoting={startVoting}
              onEndVoting={endVoting}
              onSetTimer={setTimer}
              onStopTimer={stopTimer}
              roomStatus={gameState.room?.status || 'waiting'}
              timerLeft={gameState.room?.timer_left || 0}
              timerActive={gameState.room?.timer_active === 1}
            />
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                {(activeTab === 'public' ? publicMessages : privateMessages).map((m) => (
                  <MessageBubble 
                    key={m.id} 
                    message={m} 
                    isMe={m.sender_id === playerId}
                    sender={gameState.players.find(p => p.id === m.sender_id)}
                    isBlocked={me?.is_blocked === 1}
                    onAvatarClick={() => {
                      const sender = gameState.players.find(p => p.id === m.sender_id);
                      if (sender) setShowProfileModal(sender);
                    }}
                    onAnswer={(answer) => {
                      ws.current?.send(JSON.stringify({
                        type: 'SEND_MESSAGE',
                        payload: {
                          content: answer,
                          receiverId: gameState.room?.host_id,
                          msgType: 'answer'
                        }
                      }));
                    }}
                  />
                ))}
              </div>

              {/* Input Area */}
              <div className="p-4 md:p-6 border-t border-zinc-800 bg-zinc-900/10">
                {me?.is_blocked ? (
                  <div className="bg-red-500/10 border border-red-500/20 p-3 md:p-4 rounded-2xl flex items-center justify-center text-red-500 text-xs md:text-sm">
                    <EyeOff size={18} className="mr-2 md:mr-3" />
                    <span className="font-semibold text-center">You are blocked and cannot send messages.</span>
                  </div>
                ) : (
                  <div className="relative">
                    <input 
                      type="text"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder={activeTab === 'public' ? "Message everyone..." : "Send a private message..."}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 md:px-6 py-3 md:py-4 pr-14 md:pr-16 focus:outline-none focus:border-indigo-500 transition-all text-sm md:text-base"
                    />
                    <button 
                      onClick={sendMessage}
                      className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all"
                    >
                      <Send size={18} />
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
              <div className="relative h-32 md:h-48 bg-gradient-to-br from-indigo-600 to-purple-700">
                <button 
                  onClick={() => setShowProfileModal(null)}
                  className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 rounded-full transition-all"
                >
                  <X size={20} />
                </button>
                <div className="absolute -bottom-10 md:-bottom-12 left-6 md:left-8">
                  <img 
                    src={showProfileModal.avatar_url || ''} 
                    className="w-24 h-24 md:w-32 md:h-32 rounded-3xl border-4 border-zinc-900 shadow-xl object-cover" 
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
              <div className="pt-12 md:pt-16 p-6 md:p-8 space-y-4 md:space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-bold">{showProfileModal.fake_name}</h2>
                    <p className="text-indigo-400 font-semibold text-sm md:text-base">{showProfileModal.personality} • {showProfileModal.age} years old</p>
                  </div>
                  <div className="flex">
                    {showProfileModal.is_blocked ? (
                      <div className="bg-red-500/20 text-red-500 px-3 py-1 rounded-full border border-red-500/30 text-[10px] md:text-xs font-bold uppercase">Blocked</div>
                    ) : (
                      <div className="bg-green-500/20 text-green-500 px-3 py-1 rounded-full border border-green-500/30 text-[10px] md:text-xs font-bold uppercase">Active</div>
                    )}
                  </div>
                </div>
                <div className="space-y-1 md:space-y-2">
                  <h4 className="text-[10px] md:text-xs font-bold text-zinc-500 uppercase tracking-widest">Biography</h4>
                  <p className="text-zinc-300 text-sm md:text-base leading-relaxed">{showProfileModal.bio}</p>
                </div>
                <div className="pt-2 md:pt-4 flex space-x-4">
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
  const [age, setAge] = useState('25');
  const [personality, setPersonality] = useState('Social');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(AVATARS[0]);
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setAvatarUrl(data.url);
    } catch (err) {
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4">
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="max-w-2xl w-full bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl"
      >
        <div className="p-6 md:p-8 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-2xl md:text-3xl font-bold italic tracking-tighter uppercase">Create Your Identity</h2>
          <p className="text-zinc-500 text-sm">This profile will be permanent. Choose wisely.</p>
        </div>
        
        <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
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
                  onChange={(e) => setAge(e.target.value)}
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
              <label className={cn(
                "p-2 rounded-2xl border-2 border-dashed border-zinc-700 hover:border-indigo-500 transition-all cursor-pointer flex flex-col items-center justify-center text-zinc-500 hover:text-indigo-400",
                uploading && "opacity-50 cursor-wait"
              )}>
                <Plus size={24} />
                <span className="text-[10px] font-bold uppercase mt-1">Upload</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} disabled={uploading} />
              </label>
            </div>
            {avatarUrl && !AVATARS.includes(avatarUrl) && (
              <div className="flex items-center space-x-4 p-4 bg-zinc-800 rounded-2xl">
                <img src={avatarUrl} className="w-12 h-12 rounded-xl object-cover" referrerPolicy="no-referrer" />
                <span className="text-xs text-zinc-400">Custom Avatar Selected</span>
              </div>
            )}
            <div className="pt-8">
              <button 
                onClick={() => onComplete({ fakeName, age: parseInt(age) || 0, personality, bio, avatarUrl })}
                disabled={!fakeName || !bio || uploading}
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
  onAvatarClick?: () => void;
  onAnswer?: (answer: string) => void;
}

function MessageBubble({ message, isMe, sender, onAvatarClick, onAnswer, isBlocked }: MessageBubbleProps & { isBlocked?: boolean }) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (message.type === 'question' && !isMe) {
    return (
      <div className="flex flex-col items-start w-full max-w-[95%] md:max-w-md">
        <div className="bg-amber-600/10 border border-amber-500/30 rounded-2xl p-4 md:p-6 w-full space-y-3 md:space-y-4 shadow-lg">
          <div className="flex items-center space-x-2 text-amber-500">
            <Shield size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Host Question</span>
          </div>
          <p className="text-base md:text-lg font-medium text-zinc-100">{message.content}</p>
          {isBlocked ? (
            <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl text-red-500 text-xs font-bold flex items-center">
              <EyeOff size={14} className="mr-2" />
              You are blocked and cannot answer questions.
            </div>
          ) : !submitted ? (
            <div className="space-y-3">
              <input 
                type="text" 
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type your answer..."
                className="w-full bg-black/40 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-amber-500 transition-all"
              />
              <button 
                onClick={() => {
                  if (answer.trim() && onAnswer) {
                    onAnswer(answer);
                    setSubmitted(true);
                  }
                }}
                className="w-full bg-amber-600 hover:bg-amber-500 py-2 rounded-xl font-bold transition-all"
              >
                Submit Answer
              </button>
            </div>
          ) : (
            <div className="flex items-center text-green-500 text-sm font-bold">
              <CheckCircle2 size={16} className="mr-2" />
              Answer Sent to Host
            </div>
          )}
        </div>
        <span className="text-[10px] text-zinc-600 mt-2 px-2">
          {new Date(message.created_at).toLocaleTimeString()}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
      <div className={cn("flex items-end space-x-2", isMe && "flex-row-reverse space-x-reverse")}>
        <button onClick={onAvatarClick} className="flex-shrink-0">
          <img src={sender?.avatar_url || ''} className="w-8 h-8 md:w-10 md:h-10 rounded-full mb-1 hover:ring-2 hover:ring-indigo-500 transition-all object-cover border border-zinc-800" referrerPolicy="no-referrer" />
        </button>
        <div className={cn(
          "max-w-[90%] md:max-w-md px-3 md:px-4 py-2 md:py-3 rounded-2xl text-xs md:text-sm shadow-sm",
          isMe ? "bg-indigo-600 text-white rounded-br-none" : "bg-zinc-800 text-zinc-100 rounded-bl-none",
          message.type === 'answer' && "bg-emerald-600/20 border border-emerald-500/30 text-emerald-200"
        )}>
          {!isMe && (
            <div className="flex items-center space-x-2 mb-1">
              <p className="text-[10px] font-bold text-indigo-400">{sender?.fake_name}</p>
              {sender?.is_blocked === 1 && (
                <span className="text-[8px] bg-red-500/20 text-red-500 px-1 rounded font-bold uppercase">Blocked</span>
              )}
            </div>
          )}
          {message.content}
        </div>
      </div>
      <span className="text-[10px] text-zinc-600 mt-1 px-2">
        {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
      className={cn(
        "bg-zinc-900 border rounded-2xl overflow-hidden group transition-all",
        player.is_blocked ? "border-red-900/50 opacity-80" : "border-zinc-800 hover:border-indigo-500/50"
      )}
    >
      <div className="p-3 md:p-6 flex flex-col items-center text-center space-y-2 md:space-y-4">
        <div className="relative">
          <img 
            src={player.avatar_url || ''} 
            className={cn(
              "w-16 h-16 md:w-24 md:h-24 rounded-2xl border-2 transition-all object-cover", 
              player.is_blocked ? "border-red-600 grayscale opacity-50" : "border-zinc-800 group-hover:border-indigo-500"
            )} 
            referrerPolicy="no-referrer"
          />
          {player.is_blocked && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-red-600 text-white text-[8px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 rounded rotate-[-15deg] shadow-lg border border-red-400">BLOCKED</div>
            </div>
          )}
          {player.is_host === 1 && (
            <div className="absolute -top-1 -right-1 md:-top-2 md:-right-2 bg-amber-500 text-black p-0.5 md:p-1 rounded-full shadow-lg border-2 border-zinc-900">
              <Crown size={12} className="md:w-[14px] md:h-[14px]" />
            </div>
          )}
        </div>
        <div className="bg-indigo-600/10 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-indigo-500/20">
          <span className="text-indigo-400 font-mono font-bold text-xs md:text-sm">{player.points}</span>
        </div>
        <div>
          <div className="flex items-center justify-center space-x-1">
            <h4 className="font-bold text-sm md:text-lg truncate max-w-[80px] md:max-w-none">{player.fake_name}</h4>
            {isMe && <span className="text-[8px] md:text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">(You)</span>}
          </div>
          <p className="text-[10px] md:text-xs text-zinc-500 truncate">{player.personality}</p>
          {player.is_blocked === 1 && (
            <span className="text-[10px] text-red-500 font-bold uppercase tracking-widest mt-1 block bg-red-500/10 py-0.5 rounded">Blocked Player</span>
          )}
          {player.is_host === 1 && <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mt-1 block">Room Host</span>}
        </div>
        <div className="flex w-full gap-2">
          <button 
            onClick={onView}
            className="flex-1 p-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-all flex items-center justify-center text-zinc-400 hover:text-white"
            title="View Profile"
          >
            <User size={18} />
          </button>
          {!isMe && (
            <button 
              onClick={onMessage}
              className="flex-1 p-2 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 rounded-xl transition-all flex items-center justify-center"
              title="Send Message"
            >
              <MessageSquare size={18} />
            </button>
          )}
        </div>
        {canVote && (
          <button 
            onClick={onVote}
            className="w-full py-2 bg-red-600 hover:bg-red-500 rounded-xl font-bold text-sm transition-all shadow-lg shadow-red-500/20"
          >
            Vote to Block
          </button>
        )}
      </div>
    </motion.div>
  );
}

function HostPanel({ 
  players, messages, answers, onToggleBlock, onAwardPoints, onSendQuestion, onStartVoting, onEndVoting, onSetTimer, onStopTimer, roomStatus, timerLeft, timerActive
}: { 
  players: Player[], messages: Message[], answers: Message[], onToggleBlock: (id: string, s: number) => void, 
  onAwardPoints: (id: string, p: number) => void, onSendQuestion: (c: string) => void,
  onStartVoting: () => void, onEndVoting: () => void, onSetTimer: (s: number) => void, onStopTimer: () => void,
  roomStatus: string, timerLeft: number, timerActive: boolean
}) {
  const [questionInput, setQuestionInput] = useState('');
  const [timerInput, setTimerInput] = useState('300');

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8">
      {/* Game Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-zinc-900 border border-zinc-800 p-4 md:p-6 rounded-3xl space-y-4">
          <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center">
            <Settings size={16} className="mr-2" /> Game Flow Control
          </h4>
          <div className="space-y-4">
            <div className="flex gap-4">
              {roomStatus === 'playing' ? (
                <button 
                  onClick={onStartVoting}
                  className="flex-1 bg-red-600 hover:bg-red-500 py-3 rounded-xl font-bold transition-all shadow-lg shadow-red-500/20"
                >
                  Start Voting Phase
                </button>
              ) : (
                <button 
                  onClick={onEndVoting}
                  className="flex-1 bg-green-600 hover:bg-green-500 py-3 rounded-xl font-bold transition-all shadow-lg shadow-green-500/20"
                >
                  End Voting & Block
                </button>
              )}
            </div>
            
            <div className="pt-4 border-t border-zinc-800 space-y-3">
              <h5 className="text-xs font-bold text-zinc-600 uppercase">Timer Management</h5>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  value={timerInput}
                  onChange={(e) => setTimerInput(e.target.value)}
                  className="w-24 bg-black border border-zinc-800 rounded-xl px-3 py-2 text-center focus:border-indigo-500 outline-none"
                  placeholder="Sec"
                />
                {!timerActive ? (
                  <button 
                    onClick={() => onSetTimer(parseInt(timerInput))}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 py-2 rounded-xl font-bold text-sm transition-all"
                  >
                    Start Timer
                  </button>
                ) : (
                  <button 
                    onClick={onStopTimer}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-2 rounded-xl font-bold text-sm text-red-400 transition-all"
                  >
                    Stop ({Math.floor(timerLeft / 60)}:{(timerLeft % 60).toString().padStart(2, '0')})
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl space-y-4">
          <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center">
            <MessageCircle size={16} className="mr-2" /> Send Question to All
          </h4>
          <div className="space-y-3">
            <textarea 
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 h-24 focus:outline-none focus:border-amber-500 transition-all resize-none"
              placeholder="Ask all players a question..."
            />
            <button 
              onClick={() => {
                if (questionInput.trim()) {
                  onSendQuestion(questionInput);
                  setQuestionInput('');
                }
              }}
              className="w-full bg-amber-600 hover:bg-amber-500 py-3 rounded-xl font-bold transition-all shadow-lg shadow-amber-500/20"
            >
              Broadcast Question
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
              {players.map(p => (
                <tr key={p.id} className="hover:bg-zinc-800/20 transition-all">
                  <td className="px-6 py-4 flex items-center space-x-3">
                    <img src={p.avatar_url || ''} className="w-10 h-10 rounded-full object-cover border border-zinc-700" referrerPolicy="no-referrer" />
                    <div className="flex flex-col">
                      <span className="font-bold">{p.fake_name}</span>
                      {p.is_host === 1 && <span className="text-[8px] text-amber-500 font-bold uppercase">Host</span>}
                    </div>
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
                      {!p.is_host && (
                        <div className="flex space-x-1">
                          <button 
                            onClick={() => onToggleBlock(p.id, p.is_blocked)}
                            className={cn("p-2 rounded-lg transition-all", p.is_blocked ? "bg-green-600/20 text-green-500" : "bg-red-600/20 text-red-500")}
                            title={p.is_blocked ? "Unblock Player" : "Block Player"}
                          >
                            {p.is_blocked ? <UserCheck size={16} /> : <UserX size={16} />}
                          </button>
                        </div>
                      )}
                      <div className="flex space-x-1">
                        <button 
                          onClick={() => onAwardPoints(p.id, -10)}
                          className="p-2 bg-red-600/20 text-red-500 rounded-lg hover:bg-red-600/30 transition-all font-bold text-[10px]"
                          title="Deduct 10 Points"
                        >
                          -10
                        </button>
                        <button 
                          onClick={() => onAwardPoints(p.id, 10)}
                          className="p-2 bg-indigo-600/20 text-indigo-500 rounded-lg hover:bg-indigo-600/30 transition-all font-bold text-[10px]"
                          title="Award 10 Points"
                        >
                          +10
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* DM Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden flex flex-col h-[400px]">
          <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
            <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center">
              <Eye size={16} className="mr-2" /> Live DM Monitor
            </h4>
            <span className="text-[10px] bg-amber-500/10 text-amber-500 px-2 py-1 rounded font-bold uppercase">Intercepted</span>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-black/20">
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

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden flex flex-col h-[400px]">
          <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
            <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center">
              <CheckCircle2 size={16} className="mr-2" /> Player Answers
            </h4>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded font-bold uppercase">Feedback</span>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-black/20">
            {answers.length === 0 ? (
              <p className="text-center text-zinc-600 text-sm italic py-12">No answers received yet...</p>
            ) : (
              answers.map(m => (
                <div key={m.id} className="text-xs bg-emerald-600/10 p-3 rounded-xl border border-emerald-500/20">
                  <div className="flex justify-between mb-1">
                    <span className="font-bold text-emerald-400">
                      {players.find(p => p.id === m.sender_id)?.fake_name}
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
    </div>
  );
}
