const channel = new BroadcastChannel('coaileague_session');

export function broadcastLogout() {
  channel.postMessage({ type: 'LOGOUT' });
}

export function broadcastWorkspaceSwitch(workspaceId: string) {
  channel.postMessage({ type: 'WORKSPACE_SWITCH', workspaceId });
}

export function listenForTabEvents(handlers: {
  onLogout: () => void;
  onWorkspaceSwitch: (workspaceId: string) => void;
}) {
  channel.onmessage = (event) => {
    if (event.data.type === 'LOGOUT') handlers.onLogout();
    if (event.data.type === 'WORKSPACE_SWITCH') handlers.onWorkspaceSwitch(event.data.workspaceId);
  };
  return () => { channel.onmessage = null; };
}
