// Updated DynamicMusicPlayer.tsx - Fixed audio issues with Web Audio API and fallback tracks
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';

interface DynamicMusicPlayerProps {
  enabled: boolean;
  marketCondition: 'bullish' | 'bearish' | 'volatile' | 'calm' | 'building' | 'crash';
  onToggle: () => void;
}

interface AudioTrack {
  name: string;
  composer: string;
  url: string;
  condition: 'bullish' | 'bearish' | 'volatile' | 'calm' | 'building' | 'crash';
  type: 'generated' | 'file';
}

const DynamicMusicPlayer: React.FC<DynamicMusicPlayerProps> = ({ 
  enabled, 
  marketCondition,
  onToggle
}) => {
  const [volume, setVolume] = useState<number>(0.5);
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [isMiniPlayerOpen, setIsMiniPlayerOpen] = useState<boolean>(true);
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  
  // For drag functionality
  const [position, setPosition] = useState({ x: 16, y: window.innerHeight - 64 });
  const dragRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef<boolean>(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  
  // Web Audio API references
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  
  // Load saved volume from memory (not localStorage)
  useEffect(() => {
    // Default volume, no localStorage access
    setVolume(0.3); // Start with lower volume
  }, []);
  
  // Music tracks with both generated and file-based options
  const musicTracks = useMemo<AudioTrack[]>(() => [
    {
      name: "Upward Harmony",
      composer: "Generated",
      url: "generated-bullish",
      condition: "bullish" as const,
      type: "generated" as const
    },
    {
      name: "Descending Tones",
      composer: "Generated", 
      url: "generated-bearish",
      condition: "bearish" as const,
      type: "generated" as const
    },
    {
      name: "Chaotic Rhythms",
      composer: "Generated",
      url: "generated-volatile", 
      condition: "volatile" as const,
      type: "generated" as const
    },
    {
      name: "Peaceful Ambience",
      composer: "Generated",
      url: "generated-calm",
      condition: "calm" as const,
      type: "generated" as const
    },
    {
      name: "Rising Tension",
      composer: "Generated",
      url: "generated-building",
      condition: "building" as const,
      type: "generated" as const
    },
    {
      name: "Emergency Alert",
      composer: "Generated",
      url: "generated-crash",
      condition: "crash" as const,
      type: "generated" as const
    }
  ], []);
  
  // Initialize Web Audio API
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.connect(audioContextRef.current.destination);
        gainNodeRef.current.gain.value = volume;
        setAudioError(null);
      } catch (error) {
        console.error('Failed to initialize audio context:', error);
        setAudioError('Audio not supported in this browser');
      }
    }
  }, [volume]);
  
  // Generate different types of audio based on market condition
  const generateAudio = useCallback((condition: string) => {
    if (!audioContextRef.current || !gainNodeRef.current) return;
    
    // Stop any existing oscillator
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop();
      } catch (e) {
        // Oscillator may already be stopped
      }
    }
    
    const audioContext = audioContextRef.current;
    const gainNode = gainNodeRef.current;
    
    // Create new oscillator
    const oscillator = audioContext.createOscillator();
    oscillatorRef.current = oscillator;
    
    // Configure oscillator based on market condition
    switch (condition) {
      case 'bullish':
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(220, audioContext.currentTime); // A3
        oscillator.frequency.exponentialRampToValueAtTime(440, audioContext.currentTime + 2); // A4
        break;
        
      case 'bearish':
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4
        oscillator.frequency.exponentialRampToValueAtTime(220, audioContext.currentTime + 2); // A3
        break;
        
      case 'volatile':
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(330, audioContext.currentTime);
        // Create rapid frequency changes
        for (let i = 0; i < 10; i++) {
          const time = audioContext.currentTime + (i * 0.2);
          const freq = 200 + Math.random() * 400;
          oscillator.frequency.setValueAtTime(freq, time);
        }
        break;
        
      case 'calm':
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(174, audioContext.currentTime); // Low, soothing frequency
        break;
        
      case 'building':
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(220, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 4); // Build up over 4 seconds
        break;
        
      case 'crash':
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(110, audioContext.currentTime + 1); // Rapid drop
        break;
        
      default:
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(261.63, audioContext.currentTime); // Middle C
    }
    
    // Connect and start
    oscillator.connect(gainNode);
    oscillator.start();
    
    // Stop after a reasonable duration and loop
    oscillator.stop(audioContext.currentTime + 4);
    
    // Set up looping
    oscillator.onended = () => {
      if (enabled && currentTrack?.condition === condition) {
        // Restart after a brief pause
        setTimeout(() => {
          if (enabled && currentTrack?.condition === condition) {
            generateAudio(condition);
          }
        }, 500);
      }
    };
  }, [enabled, currentTrack, volume]);
  
  const fadeOutAudio = useCallback((callback: () => void) => {
    setIsTransitioning(true);
    
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
    }
    
    if (!gainNodeRef.current) {
      callback();
      setIsTransitioning(false);
      return;
    }
    
    const startVolume = gainNodeRef.current.gain.value;
    const fadeStep = startVolume / 10;
    
    fadeIntervalRef.current = window.setInterval(() => {
      if (gainNodeRef.current) {
        if (gainNodeRef.current.gain.value - fadeStep <= 0) {
          gainNodeRef.current.gain.value = 0;
          clearInterval(fadeIntervalRef.current!);
          fadeIntervalRef.current = null;
          callback();
          setIsTransitioning(false);
        } else {
          gainNodeRef.current.gain.value -= fadeStep;
        }
      } else {
        clearInterval(fadeIntervalRef.current!);
        fadeIntervalRef.current = null;
        callback();
        setIsTransitioning(false);
      }
    }, 50);
  }, []);
  
  const fadeInAudio = useCallback(() => {
    setIsTransitioning(true);
    
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
    }
    
    if (!gainNodeRef.current) {
      setIsTransitioning(false);
      return;
    }
    
    gainNodeRef.current.gain.value = 0;
    const targetVolume = volume;
    const fadeStep = targetVolume / 10;
    
    fadeIntervalRef.current = window.setInterval(() => {
      if (gainNodeRef.current) {
        if (gainNodeRef.current.gain.value + fadeStep >= targetVolume) {
          gainNodeRef.current.gain.value = targetVolume;
          clearInterval(fadeIntervalRef.current!);
          fadeIntervalRef.current = null;
          setIsTransitioning(false);
        } else {
          gainNodeRef.current.gain.value += fadeStep;
        }
      } else {
        clearInterval(fadeIntervalRef.current!);
        fadeIntervalRef.current = null;
        setIsTransitioning(false);
      }
    }, 50);
  }, [volume]);
  
  const transitionToTrack = useCallback((newTrack: AudioTrack) => {
    fadeOutAudio(() => {
      setCurrentTrack(newTrack);
      
      if (enabled && newTrack.type === 'generated') {
        setTimeout(() => {
          generateAudio(newTrack.condition);
          fadeInAudio();
          setIsPlaying(true);
        }, 100);
      }
    });
  }, [enabled, fadeInAudio, fadeOutAudio, generateAudio]);
  
  // Setup drag handlers
  useEffect(() => {
    if (!dragRef.current) return;
    
    const handleMouseDown = (e: MouseEvent) => {
      isDragging.current = true;
      dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
      document.body.style.userSelect = 'none';
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      
      const newX = e.clientX - dragOffset.current.x;
      const newY = e.clientY - dragOffset.current.y;
      
      const maxX = window.innerWidth - (dragRef.current?.offsetWidth || 0);
      const maxY = window.innerHeight - (dragRef.current?.offsetHeight || 0);
      
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    };
    
    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.userSelect = '';
    };
    
    const elem = dragRef.current;
    elem.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      elem.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [position]);
  
  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
      }
      
      if (oscillatorRef.current) {
        try {
          oscillatorRef.current.stop();
        } catch (e) {
          // May already be stopped
        }
      }
      
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);
  
  // Handle changes in the enabled state
  useEffect(() => {
    if (enabled) {
      setIsVisible(true);
      setIsMiniPlayerOpen(true);
      initAudioContext();
    }
    
    if (enabled && audioContextRef.current) {
      // Resume audio context if it's suspended (browser autoplay policy)
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          console.log('Audio context resumed');
        }).catch(err => {
          console.error('Failed to resume audio context:', err);
          setAudioError('Click to enable audio');
        });
      }
      
      const trackForCondition = musicTracks.find(track => track.condition === marketCondition) || musicTracks[3];
      setCurrentTrack(trackForCondition);
      
      if (trackForCondition.type === 'generated') {
        generateAudio(trackForCondition.condition);
        setIsPlaying(true);
      }
    } else {
      // Stop audio when disabled
      if (oscillatorRef.current) {
        try {
          oscillatorRef.current.stop();
        } catch (e) {
          // May already be stopped
        }
      }
      setIsPlaying(false);
    }
  }, [enabled, initAudioContext, marketCondition, musicTracks, generateAudio]);
  
  // Handle changes in the market condition
  useEffect(() => {
    if (!enabled || !audioContextRef.current || isTransitioning) return;
    
    const trackForCondition = musicTracks.find(track => track.condition === marketCondition);
    
    if (trackForCondition && (!currentTrack || currentTrack.condition !== marketCondition)) {
      transitionToTrack(trackForCondition);
    }
  }, [marketCondition, enabled, isTransitioning, currentTrack, musicTracks, transitionToTrack]);
  
  // Handle volume changes
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);
  
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
  };
  
  const handleHide = () => {
    setIsMiniPlayerOpen(false);
    setIsVisible(false);
  };
  
  const handleMouseEnter = () => {
    setIsHovered(true);
  };
  
  const handleMouseLeave = () => {
    setIsHovered(false);
  };
  
  // Handle manual play/pause
  const handlePlayPause = useCallback(() => {
    if (!audioContextRef.current) {
      initAudioContext();
      return;
    }
    
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().then(() => {
        setAudioError(null);
        onToggle();
      }).catch(err => {
        console.error('Failed to resume audio context:', err);
        setAudioError('Audio context error');
      });
    } else {
      onToggle();
    }
  }, [initAudioContext, onToggle]);
  
  if (!isVisible) {
    return (
      <div 
        className="fixed bottom-4 right-4 bg-surface p-2 rounded-full shadow-lg cursor-pointer z-50"
        onClick={() => setIsVisible(true)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polygon points="10 8 16 12 10 16 10 8"></polygon>
        </svg>
      </div>
    );
  }
  
  const containerOpacity = isHovered ? 1 : 0.7;
  
  return (
    <div 
      ref={dragRef}
      className="fixed z-50 cursor-move transition-opacity duration-300"
      style={{ 
        left: `${position.x}px`, 
        top: `${position.y}px`,
        opacity: containerOpacity 
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {!isMiniPlayerOpen && enabled && currentTrack && (
        <div className="bg-surface p-3 rounded-lg shadow-lg border border-accent">
          <div className="flex items-center justify-between">
            <div className="flex items-center cursor-pointer" onClick={() => setIsMiniPlayerOpen(true)}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <circle cx="5.5" cy="17.5" r="2.5"></circle>
                <circle cx="17.5" cy="15.5" r="2.5"></circle>
                <path d="M18 3a3 3 0 0 0-3 3v13.5"></path>
                <path d="M8 5.5v12a3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3h11.5"></path>
              </svg>
              <span className="text-text-primary">{currentTrack.name}</span>
            </div>
            <button 
              className="ml-2 text-text-muted hover:text-text-primary p-1"
              onClick={handleHide}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      )}
      
      {isMiniPlayerOpen && (
        <div className="bg-surface p-4 rounded-lg shadow-lg border border-accent">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium">Dynamic Audio</h3>
            <div className="flex items-center">
              <button 
                className="text-text-muted hover:text-text-primary p-1"
                onClick={() => setIsMiniPlayerOpen(false)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                </svg>
              </button>
              <button 
                className="text-text-muted hover:text-text-primary p-1"
                onClick={handleHide}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
          
          {audioError && (
            <div className="mb-2 text-xs text-warning bg-warning/10 p-2 rounded">
              {audioError}
            </div>
          )}
          
          {currentTrack && (
            <div className="mb-2">
              <div className="text-text-primary font-medium">{currentTrack.name}</div>
              <div className="text-text-secondary text-sm">{currentTrack.composer}</div>
              <div className="text-text-muted text-xs mt-1 capitalize">
                Market mood: {currentTrack.condition}
              </div>
            </div>
          )}
          
          <div className="flex items-center space-x-2 mt-2">
            <button 
              className="p-1 rounded-full bg-accent hover:bg-accent-hover text-white"
              onClick={handlePlayPause}
            >
              {enabled && isPlaying ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="4" width="4" height="16"></rect>
                  <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              )}
            </button>
            
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            </svg>
            
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              className="w-24 h-1 bg-surface-variant rounded-lg appearance-none cursor-pointer"
            />
            
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};

export default DynamicMusicPlayer;