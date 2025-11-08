import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneCall,
  PhoneMissed,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface WebRTCCallProps {
  roomId: string;
  roomName: string;
  ws: WebSocket | null;
}

interface CallState {
  isActive: boolean;
  isIncoming: boolean;
  callerId?: string;
  callerName?: string;
  isMuted: boolean;
  isVideoEnabled: boolean;
  isSpeakerOn: boolean;
}

export function WebRTCCall({ roomId, roomName, ws }: WebRTCCallProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [callState, setCallState] = useState<CallState>({
    isActive: false,
    isIncoming: false,
    isMuted: false,
    isVideoEnabled: false,
    isSpeakerOn: true,
  });
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!ws) return;

    const handleWebSocketMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'call_initiated':
            handleIncomingCall(message);
            break;
          case 'call_accepted':
            setCallState(prev => ({ ...prev, isActive: true, isIncoming: false }));
            break;
          case 'call_rejected':
          case 'call_ended':
            handleCallEnded();
            break;
          case 'webrtc_offer':
            handleOffer(message.offer);
            break;
          case 'webrtc_answer':
            handleAnswer(message.answer);
            break;
          case 'webrtc_ice_candidate':
            handleIceCandidate(message.candidate);
            break;
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    };

    ws.addEventListener('message', handleWebSocketMessage);
    
    return () => {
      ws.removeEventListener('message', handleWebSocketMessage);
    };
  }, [ws]);

  const handleIncomingCall = (message: any) => {
    setCallState(prev => ({
      ...prev,
      isIncoming: true,
      callerId: message.callerId,
      callerName: message.callerName,
    }));
    
    toast({
      title: "Incoming Call",
      description: `${message.callerName} is calling...`,
    });
  };

  const initializePeerConnection = async () => {
    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    peerConnectionRef.current = new RTCPeerConnection(configuration);

    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate && ws) {
        ws.send(JSON.stringify({
          type: 'webrtc_ice_candidate',
          roomId,
          candidate: event.candidate,
        }));
      }
    };

    peerConnectionRef.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callState.isVideoEnabled,
      });

      localStreamRef.current = stream;
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      stream.getTracks().forEach(track => {
        peerConnectionRef.current?.addTrack(track, stream);
      });

      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      toast({
        title: "Media Access Error",
        description: "Could not access camera/microphone",
        variant: "destructive",
      });
      throw error;
    }
  };

  const startCall = async () => {
    if (!ws) {
      toast({
        title: "Connection Error",
        description: "WebSocket not connected",
        variant: "destructive",
      });
      return;
    }

    try {
      await initializePeerConnection();

      const offer = await peerConnectionRef.current?.createOffer();
      await peerConnectionRef.current?.setLocalDescription(offer);

      ws.send(JSON.stringify({
        type: 'call_initiated',
        roomId,
        callerId: user?.id,
        callerName: user?.email || 'Unknown',
      }));

      ws.send(JSON.stringify({
        type: 'webrtc_offer',
        roomId,
        offer,
      }));

      setCallState(prev => ({ ...prev, isActive: true }));
      
      toast({
        title: "Call Started",
        description: `Calling ${roomName}...`,
      });
    } catch (error) {
      console.error('Error starting call:', error);
      handleCallEnded();
    }
  };

  const answerCall = async () => {
    if (!ws) return;

    try {
      await initializePeerConnection();

      ws.send(JSON.stringify({
        type: 'call_accepted',
        roomId,
      }));

      setCallState(prev => ({ ...prev, isActive: true, isIncoming: false }));
    } catch (error) {
      console.error('Error answering call:', error);
      handleCallEnded();
    }
  };

  const rejectCall = () => {
    if (!ws) return;

    ws.send(JSON.stringify({
      type: 'call_rejected',
      roomId,
    }));

    setCallState(prev => ({
      ...prev,
      isIncoming: false,
      callerId: undefined,
      callerName: undefined,
    }));
  };

  const endCall = () => {
    if (!ws) return;

    ws.send(JSON.stringify({
      type: 'call_ended',
      roomId,
    }));

    handleCallEnded();
  };

  const handleCallEnded = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    setCallState({
      isActive: false,
      isIncoming: false,
      isMuted: false,
      isVideoEnabled: false,
      isSpeakerOn: true,
    });
  };

  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) return;

    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnectionRef.current.createAnswer();
    await peerConnectionRef.current.setLocalDescription(answer);

    if (ws) {
      ws.send(JSON.stringify({
        type: 'webrtc_answer',
        roomId,
        answer,
      }));
    }
  };

  const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) return;
    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
  };

  const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
    if (!peerConnectionRef.current) return;
    await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setCallState(prev => ({ ...prev, isMuted: !audioTrack.enabled }));
      }
    }
  };

  const toggleVideo = async () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setCallState(prev => ({ ...prev, isVideoEnabled: videoTrack.enabled }));
      } else if (!callState.isVideoEnabled) {
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const videoTrack = videoStream.getVideoTracks()[0];
          peerConnectionRef.current?.addTrack(videoTrack, localStreamRef.current);
          localStreamRef.current.addTrack(videoTrack);
          setCallState(prev => ({ ...prev, isVideoEnabled: true }));
        } catch (error) {
          console.error('Error enabling video:', error);
        }
      }
    }
  };

  const toggleSpeaker = () => {
    setCallState(prev => ({ ...prev, isSpeakerOn: !prev.isSpeakerOn }));
  };

  if (callState.isIncoming) {
    return (
      <Card className="border-primary" data-testid="card-incoming-call">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-primary animate-pulse" />
            Incoming Call
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            <span className="font-medium">{callState.callerName}</span> is calling...
          </p>
          <div className="flex gap-2">
            <Button 
              onClick={answerCall}
              className="flex-1 bg-primary hover:bg-primary"
              data-testid="button-answer-call"
            >
              <Phone className="w-4 h-4 mr-2" />
              Answer
            </Button>
            <Button 
              onClick={rejectCall}
              variant="destructive"
              className="flex-1"
              data-testid="button-reject-call"
            >
              <PhoneOff className="w-4 h-4 mr-2" />
              Decline
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (callState.isActive) {
    return (
      <Card data-testid="card-active-call">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-primary" />
              Active Call
            </span>
            <Badge variant="secondary">
              {roomName}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="relative bg-muted rounded-lg overflow-hidden aspect-video">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
                data-testid="video-local"
              />
              <Badge className="absolute bottom-2 left-2">You</Badge>
            </div>
            <div className="relative bg-muted rounded-lg overflow-hidden aspect-video">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
                data-testid="video-remote"
              />
              <Badge className="absolute bottom-2 left-2">Remote</Badge>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2">
            <Button
              variant={callState.isMuted ? "destructive" : "secondary"}
              size="icon"
              onClick={toggleMute}
              data-testid="button-toggle-mute"
            >
              {callState.isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>

            <Button
              variant={callState.isVideoEnabled ? "secondary" : "destructive"}
              size="icon"
              onClick={toggleVideo}
              data-testid="button-toggle-video"
            >
              {callState.isVideoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </Button>

            <Button
              variant={callState.isSpeakerOn ? "secondary" : "outline"}
              size="icon"
              onClick={toggleSpeaker}
              data-testid="button-toggle-speaker"
            >
              {callState.isSpeakerOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </Button>

            <Button
              variant="destructive"
              onClick={endCall}
              data-testid="button-end-call"
            >
              <PhoneOff className="w-4 h-4 mr-2" />
              End Call
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Button
      onClick={startCall}
      variant="outline"
      disabled={!ws}
      data-testid="button-start-call"
    >
      <Phone className="w-4 h-4 mr-2" />
      Start Call
    </Button>
  );
}
