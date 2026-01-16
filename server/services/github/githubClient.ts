// GitHub Integration Client
// Uses Replit's GitHub connector for authentication

import { Octokit } from '@octokit/rest';

let connectionSettings: any;

async function getAccessToken(): Promise<string> {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
export async function getUncachableGitHubClient(): Promise<Octokit> {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

// Get authenticated user info
export async function getGitHubUser() {
  const client = await getUncachableGitHubClient();
  const { data } = await client.users.getAuthenticated();
  return data;
}

// Create a new repository
export async function createRepository(name: string, description?: string, isPrivate: boolean = true) {
  const client = await getUncachableGitHubClient();
  const { data } = await client.repos.createForAuthenticatedUser({
    name,
    description: description || 'CoAIleague - AI-Powered Workforce Intelligence Platform',
    private: isPrivate,
    auto_init: false,
  });
  return data;
}

// Check if repository exists
export async function checkRepositoryExists(owner: string, repo: string): Promise<boolean> {
  const client = await getUncachableGitHubClient();
  try {
    await client.repos.get({ owner, repo });
    return true;
  } catch (error: any) {
    if (error.status === 404) {
      return false;
    }
    throw error;
  }
}
