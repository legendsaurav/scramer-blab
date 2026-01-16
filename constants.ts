
import { User, UserRole, Project, MeetingRecording, SoftwareSession, Announcement, ChatMessage, SoftwareType, SoftwareToolConfig } from './types';

// Software Configuration (Fixed library of supported tools)
export const SOFTWARE_TOOLS: SoftwareToolConfig[] = [
  { 
    id: SoftwareType.ARDUINO, 
    name: 'Arduino IDE', 
    url: 'https://app.arduino.cc/sketches?custom_banner=cloud_banner',
    description: 'Open-source electronic prototyping platform.',
    iconBg: 'bg-teal-600',
    logoUrl: 'https://cdn.worldvectorlogo.com/logos/arduino-1.svg'
  },
  { 
    id: SoftwareType.AUTOCAD, 
    name: 'AutoCAD Web', 
    url: 'https://web.autocad.com/',
    description: 'Computer-aided design (CAD) software.',
    iconBg: 'bg-red-700',
    logoUrl: ''
  },
  { 
    id: SoftwareType.SOLIDWORKS, 
    name: 'SolidWorks', 
    url: 'http://localhost:5000/open-solidworks',
    description: 'Launch local SolidWorks via launcher.',
    iconBg: 'bg-red-600',
    logoUrl: 'https://cdn.worldvectorlogo.com/logos/solidworks.svg'
  },
  { 
    id: SoftwareType.MATLAB, 
    name: 'MATLAB Online', 
    url: 'https://matlab.mathworks.com/',
    description: 'Cloud-based numerical computing environment.',
    iconBg: 'bg-orange-600',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/21/Matlab_Logo.png'
  },
  { 
    id: SoftwareType.VSCODE, 
    name: 'VS Code', 
    url: 'https://vscode.dev/',
    description: 'Code editing. Redefined.',
    iconBg: 'bg-blue-500',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/9/9a/Visual_Studio_Code_1.35_icon.svg'
  },
  { 
    id: SoftwareType.PROTEUS, 
    name: 'Proteus', 
    url: 'https://labcenter.com/simulation',
    description: 'Circuit simulation and PCB design.',
    iconBg: 'bg-blue-600',
    logoUrl: '' 
  },
  { 
    id: SoftwareType.GITHUB, 
    name: 'GitHub', 
    url: 'https://github.com/',
    description: 'Version control and collaboration.',
    iconBg: 'bg-slate-800',
    logoUrl: 'https://cdn.worldvectorlogo.com/logos/github-icon-1.svg'
  }
];

// Initial empty states for a fresh user experience
export const MOCK_USERS: User[] = [];
export const MOCK_PROJECTS: Project[] = [];
export const MOCK_MEETINGS: MeetingRecording[] = [];
export const MOCK_SESSIONS: SoftwareSession[] = [];
export const MOCK_ANNOUNCEMENTS: Announcement[] = [];
export const MOCK_CHAT: ChatMessage[] = [];

// Team access mode: when true, aggregate metrics across all authenticated users
// Set via environment: VITE_TEAM_MODE_ALL=true
export const TEAM_MODE_ALL: boolean = ((import.meta as any)?.env?.VITE_TEAM_MODE_ALL === 'true');
