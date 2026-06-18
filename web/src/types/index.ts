export interface Session {
  id: string;
  name: string;
  status: 'active' | 'archived';
  voteIntervalMinutes: number;
  requireTopicToVote: boolean;
  createdBy: string;
  createdAt: string;
}

export interface Topic {
  id: string;
  sessionId: string;
  title: string;
  speakerName?: string;      // Only visible to gamekeepers
  submittedBy?: string;       // Only visible to gamekeepers
  isOwn?: boolean;            // True if current user submitted this topic
  status: 'pending' | 'completed';
  voteCount: number;
  completedAt?: string;
  createdAt: string;
}

export interface VoteAllocation {
  topicId: string;
  count: number;
}

export interface VoteStatus {
  remaining: number;
  totalGranted: number;
  used: number;
  allocations: VoteAllocation[];
  nextVoteAt?: string;        // ISO 8601 — when next vote can be granted
  canVote: boolean;           // false if no topics submitted
}

export interface AuthStatus {
  isAuthenticated: boolean;
  user?: {
    userId: string;
    userDetails: string;
    identityProvider: string;
    userRoles: string[];
  };
  isGamekeeper: boolean;
  suggestedName?: string;
}

export interface Gamekeeper {
  email: string;
  displayName: string;
  addedBy: string;
  addedAt: string;
}

export interface VoterStatus {
  registered: boolean;
  displayName?: string;
  topicsSubmitted?: number;
  totalVotesGranted?: number;
  votesUsed?: number;
  lastVoteGrantedAt?: string;
  registeredAt?: string;
}
