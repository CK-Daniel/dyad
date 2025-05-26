// Mock Electron API for web-only mode
interface MockIpcRenderer {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  on: (channel: string, listener: (...args: any[]) => void) => () => void;
  removeAllListeners: (channel: string) => void;
  removeListener: (channel: string, listener: (...args: any[]) => void) => void;
}

// Store for mock data
const mockData = {
  apps: [],
  chats: [],
  settings: {
    telemetryEnabled: true,
    theme: 'system',
    autoApprove: false,
    maxChatTurns: 10,
    codespacesBrowserMode: true,
  },
  platform: 'web',
};

// Mock IPC handlers
const mockHandlers: Record<string, (...args: any[]) => any> = {
  'get-system-platform': () => 'web',
  'get-app-version': () => '0.7.0-web',
  'get-user-settings': () => mockData.settings,
  'set-user-settings': (settings: any) => {
    mockData.settings = { ...mockData.settings, ...settings };
    return mockData.settings;
  },
  'list-apps': () => mockData.apps,
  'get-app': (appId: string) => mockData.apps.find((app: any) => app.id === appId),
  'create-app': (app: any) => {
    const newApp = { ...app, id: Date.now().toString() };
    mockData.apps.push(newApp);
    return newApp;
  },
  'get-chats': () => mockData.chats,
  'create-chat': (chat: any) => {
    const newChat = { ...chat, id: Date.now().toString() };
    mockData.chats.push(newChat);
    return newChat;
  },
  'get-language-models': () => [
    { id: 'mock-gpt-4', name: 'Mock GPT-4', provider: 'mock' },
    { id: 'mock-claude', name: 'Mock Claude', provider: 'mock' },
  ],
  'get-language-model-providers': () => [
    { id: 'mock', name: 'Mock Provider', isConfigured: true },
  ],
  'nodejs-status': () => ({ installed: true, version: '20.0.0' }),
  'github:is-repo-available': () => false,
  'open-external-url': (url: string) => {
    window.open(url, '_blank');
    return true;
  },
};

// Event emitter for mock events
const eventListeners = new Map<string, Set<(...args: any[]) => void>>();

const mockIpcRenderer: MockIpcRenderer = {
  invoke: async (channel: string, ...args: any[]) => {
    console.log(`[Mock IPC] invoke: ${channel}`, args);
    
    const handler = mockHandlers[channel];
    if (handler) {
      return Promise.resolve(handler(...args));
    }
    
    console.warn(`[Mock IPC] No handler for channel: ${channel}`);
    return Promise.reject(new Error(`No mock handler for channel: ${channel}`));
  },
  
  on: (channel: string, listener: (...args: any[]) => void) => {
    console.log(`[Mock IPC] on: ${channel}`);
    
    if (!eventListeners.has(channel)) {
      eventListeners.set(channel, new Set());
    }
    eventListeners.get(channel)!.add(listener);
    
    // Return unsubscribe function
    return () => {
      const listeners = eventListeners.get(channel);
      if (listeners) {
        listeners.delete(listener);
      }
    };
  },
  
  removeAllListeners: (channel: string) => {
    console.log(`[Mock IPC] removeAllListeners: ${channel}`);
    eventListeners.delete(channel);
  },
  
  removeListener: (channel: string, listener: (...args: any[]) => void) => {
    console.log(`[Mock IPC] removeListener: ${channel}`);
    const listeners = eventListeners.get(channel);
    if (listeners) {
      listeners.delete(listener);
    }
  },
};

// Create mock electron object
export const mockElectron = {
  ipcRenderer: mockIpcRenderer,
};

// Simulate some events
export function simulateMockEvents() {
  // Simulate app output
  setTimeout(() => {
    const listeners = eventListeners.get('app:output');
    if (listeners) {
      listeners.forEach(listener => {
        listener({
          appId: 'mock-app',
          output: 'Mock app output: Server started on port 3000\n',
        });
      });
    }
  }, 2000);
}

// Install mock electron on window
if (typeof window !== 'undefined' && !window.electron) {
  (window as any).electron = mockElectron;
  console.log('[Mock Electron] Installed mock electron API for web mode');
}