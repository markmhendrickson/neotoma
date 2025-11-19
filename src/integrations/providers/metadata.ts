import type { ProviderCapability } from './types.js';

export type ProviderCategory = 'social' | 'productivity';

export interface ProviderOAuthDefinition {
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  usePkce?: boolean;
  accessType?: string;
  prompt?: string;
  userInfoUrl?: string;
}

export interface ProviderDefinition {
  id: string;
  displayName: string;
  providerType: ProviderCategory;
  capabilities: ProviderCapability[];
  defaultRecordType: string;
  popularityRank: number;
  oauthScopes?: string[];
  notes?: string;
  oauth?: ProviderOAuthDefinition;
}

export const providerCatalog: ProviderDefinition[] = [
  { id: 'x', displayName: 'X (Twitter)', providerType: 'social', capabilities: ['messages', 'media'], defaultRecordType: 'message', popularityRank: 1, oauthScopes: ['tweet.read', 'users.read'], notes: 'Twitter API v2' },
  { id: 'facebook', displayName: 'Facebook', providerType: 'social', capabilities: ['messages', 'media'], defaultRecordType: 'message', popularityRank: 2, oauthScopes: ['pages_read_engagement', 'pages_read_user_content'] },
  { id: 'instagram', displayName: 'Instagram', providerType: 'social', capabilities: ['media', 'messages'], defaultRecordType: 'media_asset', popularityRank: 3, oauthScopes: ['instagram_basic', 'pages_read_engagement'] },
  { id: 'linkedin', displayName: 'LinkedIn', providerType: 'social', capabilities: ['messages'], defaultRecordType: 'message', popularityRank: 4, oauthScopes: ['r_member_social'] },
  { id: 'tiktok', displayName: 'TikTok', providerType: 'social', capabilities: ['media'], defaultRecordType: 'media_asset', popularityRank: 5 },
  { id: 'snapchat', displayName: 'Snapchat', providerType: 'social', capabilities: ['media', 'messages'], defaultRecordType: 'media_asset', popularityRank: 6 },
  { id: 'youtube', displayName: 'YouTube', providerType: 'social', capabilities: ['media'], defaultRecordType: 'media_asset', popularityRank: 7, oauthScopes: ['https://www.googleapis.com/auth/youtube.readonly'] },
  { id: 'pinterest', displayName: 'Pinterest', providerType: 'social', capabilities: ['media'], defaultRecordType: 'media_asset', popularityRank: 8 },
  { id: 'reddit', displayName: 'Reddit', providerType: 'social', capabilities: ['messages'], defaultRecordType: 'message', popularityRank: 9 },
  { id: 'tumblr', displayName: 'Tumblr', providerType: 'social', capabilities: ['messages', 'media'], defaultRecordType: 'note', popularityRank: 10 },
  { id: 'threads', displayName: 'Threads', providerType: 'social', capabilities: ['messages'], defaultRecordType: 'message', popularityRank: 11 },
  { id: 'discord', displayName: 'Discord', providerType: 'social', capabilities: ['messages'], defaultRecordType: 'message', popularityRank: 12 },
  { id: 'telegram', displayName: 'Telegram', providerType: 'social', capabilities: ['messages'], defaultRecordType: 'message', popularityRank: 13 },
  { id: 'whatsapp-business', displayName: 'WhatsApp Business', providerType: 'social', capabilities: ['messages'], defaultRecordType: 'message', popularityRank: 14 },
  { id: 'wechat', displayName: 'WeChat', providerType: 'social', capabilities: ['messages'], defaultRecordType: 'message', popularityRank: 15 },
  { id: 'line', displayName: 'Line', providerType: 'social', capabilities: ['messages'], defaultRecordType: 'message', popularityRank: 16 },
  {
    id: 'gmail',
    displayName: 'Gmail',
    providerType: 'productivity',
    capabilities: ['email'],
    defaultRecordType: 'message',
    popularityRank: 17,
    oauthScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    oauth: {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      usePkce: true,
      accessType: 'offline',
      prompt: 'consent',
      userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    },
  },
  { id: 'outlook', displayName: 'Outlook / Exchange Online', providerType: 'productivity', capabilities: ['email'], defaultRecordType: 'message', popularityRank: 18, oauthScopes: ['Mail.Read'] },
  { id: 'microsoft-teams', displayName: 'Microsoft Teams', providerType: 'productivity', capabilities: ['messages'], defaultRecordType: 'message', popularityRank: 19, oauthScopes: ['ChannelMessage.Read.All'] },
  { id: 'slack', displayName: 'Slack', providerType: 'productivity', capabilities: ['messages'], defaultRecordType: 'message', popularityRank: 20, oauthScopes: ['channels:history', 'groups:history'] },
  { id: 'notion', displayName: 'Notion', providerType: 'productivity', capabilities: ['notes', 'tasks'], defaultRecordType: 'note', popularityRank: 21 },
  { id: 'asana', displayName: 'Asana', providerType: 'productivity', capabilities: ['tasks'], defaultRecordType: 'task', popularityRank: 22, oauthScopes: ['default'] },
  { id: 'trello', displayName: 'Trello', providerType: 'productivity', capabilities: ['tasks'], defaultRecordType: 'task', popularityRank: 23 },
  { id: 'monday', displayName: 'Monday.com', providerType: 'productivity', capabilities: ['tasks'], defaultRecordType: 'task', popularityRank: 24 },
  { id: 'clickup', displayName: 'ClickUp', providerType: 'productivity', capabilities: ['tasks'], defaultRecordType: 'task', popularityRank: 25 },
  { id: 'jira', displayName: 'Jira', providerType: 'productivity', capabilities: ['tasks'], defaultRecordType: 'task', popularityRank: 26 },
  { id: 'linear', displayName: 'Linear', providerType: 'productivity', capabilities: ['tasks'], defaultRecordType: 'task', popularityRank: 27 },
  { id: 'basecamp', displayName: 'Basecamp', providerType: 'productivity', capabilities: ['tasks', 'messages'], defaultRecordType: 'task', popularityRank: 28 },
  { id: 'airtable', displayName: 'Airtable', providerType: 'productivity', capabilities: ['records'], defaultRecordType: 'note', popularityRank: 29 },
  { id: 'google-drive', displayName: 'Google Drive', providerType: 'productivity', capabilities: ['files'], defaultRecordType: 'media_asset', popularityRank: 30, oauthScopes: ['https://www.googleapis.com/auth/drive.readonly'] },
  { id: 'onedrive', displayName: 'OneDrive', providerType: 'productivity', capabilities: ['files'], defaultRecordType: 'media_asset', popularityRank: 31 },
  { id: 'box', displayName: 'Box', providerType: 'productivity', capabilities: ['files'], defaultRecordType: 'media_asset', popularityRank: 32 },
  { id: 'dropbox', displayName: 'Dropbox', providerType: 'productivity', capabilities: ['files'], defaultRecordType: 'media_asset', popularityRank: 33 },
  { id: 'evernote', displayName: 'Evernote', providerType: 'productivity', capabilities: ['notes'], defaultRecordType: 'note', popularityRank: 34 },
  { id: 'confluence', displayName: 'Confluence', providerType: 'productivity', capabilities: ['notes'], defaultRecordType: 'note', popularityRank: 35 },
  { id: 'salesforce', displayName: 'Salesforce', providerType: 'productivity', capabilities: ['records'], defaultRecordType: 'note', popularityRank: 36 },
  { id: 'hubspot', displayName: 'HubSpot', providerType: 'productivity', capabilities: ['records'], defaultRecordType: 'note', popularityRank: 37 },
  { id: 'zendesk', displayName: 'Zendesk', providerType: 'productivity', capabilities: ['tickets'], defaultRecordType: 'task', popularityRank: 38 },
  { id: 'intercom', displayName: 'Intercom', providerType: 'productivity', capabilities: ['messages', 'tickets'], defaultRecordType: 'message', popularityRank: 39 },
  { id: 'front', displayName: 'Front', providerType: 'productivity', capabilities: ['messages'], defaultRecordType: 'message', popularityRank: 40 },
  { id: 'calendly', displayName: 'Calendly', providerType: 'productivity', capabilities: ['calendar'], defaultRecordType: 'event', popularityRank: 41 },
  { id: 'google-calendar', displayName: 'Google Calendar', providerType: 'productivity', capabilities: ['calendar'], defaultRecordType: 'event', popularityRank: 42, oauthScopes: ['https://www.googleapis.com/auth/calendar.readonly'] },
  { id: 'apple-calendar', displayName: 'Apple Calendar (CalDAV)', providerType: 'productivity', capabilities: ['calendar'], defaultRecordType: 'event', popularityRank: 43 },
  { id: 'zoom', displayName: 'Zoom', providerType: 'productivity', capabilities: ['calendar', 'media'], defaultRecordType: 'event', popularityRank: 44 },
  { id: 'google-meet', displayName: 'Google Meet', providerType: 'productivity', capabilities: ['calendar', 'media'], defaultRecordType: 'event', popularityRank: 45 },
  { id: 'microsoft-graph', displayName: 'Microsoft Graph Calendar/Tasks', providerType: 'productivity', capabilities: ['calendar', 'tasks'], defaultRecordType: 'event', popularityRank: 46 },
  { id: 'todoist', displayName: 'Todoist', providerType: 'productivity', capabilities: ['tasks'], defaultRecordType: 'task', popularityRank: 47 },
];

export function getProviderDefinition(id: string): ProviderDefinition | undefined {
  return providerCatalog.find((definition) => definition.id === id);
}




