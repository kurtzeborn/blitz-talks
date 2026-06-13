export interface SessionEntity {
  partitionKey: string;        // 'session'
  rowKey: string;              // sessionId
  name: string;
  status: 'active' | 'archived';
  voteIntervalMinutes: number;
  createdBy: string;
  createdAt: Date;
}

export interface TopicEntity {
  partitionKey: string;        // sessionId
  rowKey: string;              // topicId (UUID)
  title: string;
  submittedBy: string;         // email
  speakerName: string;
  status: 'pending' | 'completed';
  voteCount: number;
  completedAt?: Date;
  createdAt: Date;
}

export interface VoteEntity {
  partitionKey: string;        // sessionId
  rowKey: string;              // `${voterEmail}#${topicId}`
  topicId: string;
  voterEmail: string;
  count: number;               // votes allocated to this topic by this voter
  updatedAt: Date;
}

export interface VoterEntity {
  partitionKey: string;        // sessionId
  rowKey: string;              // email
  displayName: string;
  topicsSubmitted: number;
  totalVotesGranted: number;
  votesUsed: number;
  lastVoteGrantedAt: Date;
  registeredAt: Date;
}

export interface GamekeeperEntity {
  partitionKey: string;        // 'gamekeeper'
  rowKey: string;              // email
  displayName: string;
  addedBy: string;
  addedAt: Date;
}
