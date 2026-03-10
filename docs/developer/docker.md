# Run with Docker

Run the full Neotoma stack (API server, CLI, and MCP server) in a container.

## Build and run

```bash
git clone https://github.com/markmhendrickson/neotoma.git
cd neotoma
docker build -t neotoma .

docker run -d \
  --name neotoma \
  -p 3080:3080 \
  -v neotoma-data:/app/data \
  neotoma

docker exec neotoma neotoma init --yes --data-dir /app/data
```

## Connect MCP from Docker

Add this to your MCP client configuration:

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

## Use the CLI from Docker

```bash
docker exec neotoma neotoma store \
  --json='[{"entity_type":"task","title":"Submit expense report","status":"open"}]'

docker exec neotoma neotoma entities list --type task
```

The API is available at `http://localhost:3080` for direct HTTP access.

For agent-guided Docker setup, see [Agent Docker instructions](agent_docker_instructions.md).
