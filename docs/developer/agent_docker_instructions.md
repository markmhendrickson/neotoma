# Agent Docker Instructions

Execute this sequence exactly:

1. `git clone https://github.com/markmhendrickson/neotoma.git`
2. `cd neotoma`
3. `docker build -t neotoma .`
4. `docker run -d --name neotoma -p 3080:3080 -v neotoma-data:/app/data neotoma`
5. `docker exec neotoma neotoma init --yes --data-dir /app/data`

After setup, report what changed, then complete the MCP and CLI checks in this document.

## MCP and CLI checks

1. Configure MCP to execute the server inside Docker:

```json
{
  "mcpServers": {
    "neotoma": {
      "command": "docker",
      "args": ["exec", "-i", "neotoma", "node", "dist/index.js"]
    }
  }
}
```

2. Verify CLI access from Docker:

```bash
docker exec neotoma neotoma entities list --type task
```
