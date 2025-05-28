// Fixed DynamicMusicPlayer.tsx - Using real classical music instead of generated tones
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
}

const DynamicMusicPlayer: React.FC<DynamicMusicPlayerProps> = ({ 
  enabled, 
  marketCondition,
  onToggle
}) => {
  const [volume, setVolume] = useState<number>(0.3);
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [isMiniPlayerOpen, setIsMiniPlayerOpen] = useState<boolean>(true);
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // For drag functionality
  const [position, setPosition] = useState({ x: 16, y: window.innerHeight - 200 });
  const dragRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef<boolean>(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  
  // Audio element reference
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  
  // Classical music tracks from public domain sources
  const musicTracks = useMemo<AudioTrack[]>(() => [
    {
      name: "Spring - Allegro",
      composer: "Vivaldi",
      url: "https://upload.wikimedia.org/wikipedia/commons/8/8f/Vivaldi_Spring_mvt_1_Allegro_-_John_Harrison_violin.ogg",
      condition: "bullish" as const
    },
    {
      name: "Moonlight Sonata - 1st Movement",
      composer: "Beethoven",
      url: "https://upload.wikimedia.org/wikipedia/commons/6/6b/Moonlight_Sonata_-_1st_Movement_-_Opus_27_Nr._2_-_Ludwig_van_Beethoven.ogg",
      condition: "bearish" as const
    },
    {
      name: "Flight of the Bumblebee",
      composer: "Rimsky-Korsakov",
      url: "https://upload.wikimedia.org/wikipedia/commons/a/a5/Rimsky-Korsakov_-_Flight_of_the_Bumblebee.ogg",
      condition: "volatile" as const
    },
    {
      name: "Clair de Lune",
      composer: "Debussy",
      url: "https://upload.wikimedia.org/wikipedia/commons/5/5b/Claude_Debussy_-_Clair_de_lune.ogg",
      condition: "calm" as const
    },
    {
      name: "In the Hall of the Mountain King",
      composer: "Grieg",
      url: "https://upload.wikimedia.org/wikipedia/commons/0/05/Grieg_-_In_the_Hall_of_the_Mountain_King.ogg",
      condition: "building" as const
    },
    {
      name: "Dies Irae",
      composer: "Verdi",
      url: "https://upload.wikimedia.org/wikipedia/commons/2/29/Giuseppe_Verdi_-_Requiem_-_02_Dies_Irae.ogg",
      condition: "crash" as const
    }
  ], []);
  
  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
      audioRef.current.volume = volume;
      
      // Add event listeners
      audioRef.current.addEventListener('loadstart', () => {
        setIsLoading(true);
        setAudioError(null);
      });
      
      audioRef.current.addEventListener('canplaythrough', () => {
        setIsLoading(false);
        setAudioError(null);
      });
      
      audioRef.current.addEventListener('error', (e) => {
        setIsLoading(false);
        console.error('Audio error:', e);
        setAudioError('Failed to load audio. Check your internet connection.');
      });
      
      audioRef.current.addEventListener('ended', () => {
        // Loop is enabled, but just in case
        if (enabled && audioRef.current) {
          audioRef.current.play().catch(console.error);
        }
      });
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);
  
  // Fade out audio
  const fadeOutAudio = useCallback((callback: () => void) => {
    setIsTransitioning(true);
    
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
    }
    
    if (!audioRef.current) {
      callback();
      setIsTransitioning(false);
      return;
    }
    
    const startVolume = audioRef.current.volume;
    const fadeStep = startVolume / 20;
    
    fadeIntervalRef.current = window.setInterval(() => {
      if (audioRef.current) {
        if (audioRef.current.volume - fadeStep <= 0) {
          audioRef.current.volume = 0;
          audioRef.current.pause();
          clearInterval(fadeIntervalRef.current!);
          fadeIntervalRef.current = null;
          callback();
          setIsTransitioning(false);
        } else {
          audioRef.current.volume -= fadeStep;
        }
      }
    }, 50);
  }, []);
  
  // Fade in audio
  const fadeInAudio = useCallback(() => {
    setIsTransitioning(true);
    
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
    }
    
    if (!audioRef.current) {
      setIsTransitioning(false);
      return;
    }
    
    audioRef.current.volume = 0;
    audioRef.current.play().then(() => {
      setIsPlaying(true);
      
      const targetVolume = volume;
      const fadeStep = targetVolume / 20;
      
      fadeIntervalRef.current = window.setInterval(() => {
        if (audioRef.current) {
          if (audioRef.current.volume + fadeStep >= targetVolume) {
            audioRef.current.volume = targetVolume;
            clearInterval(fadeIntervalRef.current!);
            fadeIntervalRef.current = null;
            setIsTransitioning(false);
          } else {
            audioRef.current.volume += fadeStep;
          }
        }
      }, 50);
    }).catch(err => {
      console.error('Failed to play audio:', err);
      setAudioError('Click play to start audio');
      setIsTransitioning(false);
    });
  }, [volume]);
  
  // Transition to new track
  const transitionToTrack = useCallback((newTrack: AudioTrack) => {
    fadeOutAudio(() => {
      setCurrentTrack(newTrack);
      
      if (audioRef.current && enabled) {
        audioRef.current.src = newTrack.url;
        audioRef.current.load();
        
        // Wait for audio to be ready before fading in
        const canPlayHandler = () => {
          fadeInAudio();
          audioRef.current?.removeEventListener('canplaythrough', canPlayHandler);
        };
        
        audioRef.current.addEventListener('canplaythrough', canPlayHandler);
      }
    });
  }, [enabled, fadeInAudio, fadeOutAudio]);
  
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
  
  // Handle enabled state changes
  useEffect(() => {
    if (enabled && audioRef.current) {
      const trackForCondition = musicTracks.find(track => track.condition === marketCondition) || musicTracks[3];
      
      if (!currentTrack || currentTrack.condition !== marketCondition) {
        transitionToTrack(trackForCondition);
      } else if (!audioRef.current.src || audioRef.current.paused) {
        // Resume playing if paused
        audioRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(err => {
          console.error('Failed to resume audio:', err);
          setAudioError('Click play to start audio');
        });
      }
    } else if (!enabled && audioRef.current && !audioRef.current.paused) {
      fadeOutAudio(() => {
        setIsPlaying(false);
      });
    }
  }, [enabled, marketCondition, musicTracks, currentTrack, transitionToTrack, fadeOutAudio]);
  
  // Handle market condition changes
  useEffect(() => {
    if (!enabled || isTransitioning) return;
    
    const trackForCondition = musicTracks.find(track => track.condition === marketCondition);
    
    if (trackForCondition && currentTrack && currentTrack.condition !== marketCondition) {
      transitionToTrack(trackForCondition);
    }
  }, [marketCondition, enabled, isTransitioning, currentTrack, musicTracks, transitionToTrack]);
  
  // Handle volume changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);
  
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
  };
  
  const handlePlayPause = useCallback(() => {
    if (!audioRef.current) return;
    
    if (audioRef.current.paused) {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        setAudioError(null);
        if (!enabled) onToggle();
      }).catch(err => {
        console.error('Failed to play audio:', err);
        setAudioError('Audio playback failed');
      });
    } else {
      onToggle();
    }
  }, [enabled, onToggle]);
  
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
  
  return (
    <div 
      ref={dragRef}
      className="fixed z-50 cursor-move transition-opacity duration-300"
      style={{ 
        left: `${position.x}px`, 
        top: `${position.y}px`,
        opacity: isHovered ? 1 : 0.8
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="bg-surface p-4 rounded-lg shadow-lg border border-accent">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-medium">Dynamic Music</h3>
          <button 
            className="text-text-muted hover:text-text-primary p-1"
            onClick={() => setIsVisible(false)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        {audioError && (
          <div className="mb-2 text-xs text-warning bg-warning/10 p-2 rounded">
            {audioError}
          </div>
        )}
        
        {isLoading && (
          <div className="mb-2 text-xs text-info">
            Loading music...
          </div>
        )}
        
        {currentTrack && (
          <div className="mb-3">
            <div className="text-text-primary font-medium">{currentTrack.name}</div>
            <div className="text-text-secondary text-sm">{currentTrack.composer}</div>
            <div className="text-text-muted text-xs mt-1 capitalize">
              Market: {marketCondition}
            </div>
          </div>
        )}
        
        <div className="flex items-center space-x-2">
          <button 
            className="p-2 rounded-full bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
            onClick={handlePlayPause}
            disabled={isLoading}
          >
            {enabled && isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            )}
          </button>
          
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          
          <span className="text-xs text-text-muted">
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
};

export default DynamicMusicPlayer;