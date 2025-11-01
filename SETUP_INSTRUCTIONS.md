# ChatGPT Atlas Setup Instructions

Copy the following to ChatGPT Atlas to configure your Supabase backend:

---

## Instructions for ChatGPT Atlas

Set up the MCP Server by completing the following Supabase configuration steps:

### 1. Create Supabase Project
- Navigate to https://supabase.com and sign in (or create account)
- Click "New Project"
- Choose a name (e.g., "mcp-memory")
- Set a database password (save this securely)
- Select a region closest to you
- Click "Create new project"
- Wait ~2 minutes for project provisioning

### 2. Run Database Schema
- In your Supabase dashboard, click "SQL Editor" in the left sidebar
- Click "New Query"
- Open the file `neotoma/supabase/schema.sql` from the project
- Copy the entire contents and paste into the SQL editor
- Click "Run" button (or press Cmd+Enter)
- Wait for success confirmation
- This creates the `objects` table with GIN indexes for fast queries

### 3. Get API Credentials
- In Supabase dashboard, go to "Settings" → "API"
- Under "Project API keys", find the "service_role" key (NOT the anon key)
- Copy the "Project URL" and "service_role" secret
- Create or update the file `neotoma/.env` with:
```
SUPABASE_URL=paste_your_project_url_here
SUPABASE_SERVICE_KEY=paste_your_service_role_key_here
PORT=3000
```
- Replace the placeholders with your actual values

### 4. Create Storage Bucket
- In Supabase dashboard, click "Storage" in the left sidebar
- Click "New bucket"
- Name: `files`
- Make it a public bucket: YES
- Click "Create bucket"

### 5. Verify Configuration
- Navigate to the `neotoma` directory
- Confirm `.env` file exists with valid credentials
- Run: `npm test` (this will execute live queries against Supabase)
- If tests pass, the MCP server is ready to use

### 6. Test MCP Server
- Run: `npm run dev` to start the server
- The server should start without errors
- If you see "MCP Server running on stdio", configuration is successful

Report any errors you encounter during setup.

