# MCP (Model Context Protocol) Integration

Pi has built-in support for [MCP](https://modelcontextprotocol.io) — connect any MCP server (Supabase, DeepSource, Playwright, Context7, filesystem, databases) and its tools become available to the LLM as `mcp_<server>_<tool>`.

No extension install required. Configure once, tools appear automatically.

---

## Quick Start

### 1. Create a config file

**Global** (`~/.pie/agent/mcp.json`) — applies to all projects:

```bash
mkdir -p ~/.pie/agent
cat > ~/.pie/agent/mcp.json << 'EOF'
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "transport": "stdio",
      "lifecycle": "eager"
    }
  }
}
EOF
```

**Project-local** (`.pie/mcp.json`) — overrides global per server, only loaded for trusted projects.

### 2. Start pi

```bash
./pi-test.sh
```

### 3. Verify tools loaded

```bash
/mcp            # Show all MCP server status and tool count
/mcp filesystem # Show detailed status for one server
```

MCP tools appear as `mcp_<server>_<tool>` (e.g., `mcp_filesystem_read_file`) and are callable by the LLM immediately.

---

## Configuration

| Location | Scope |
|----------|-------|
| `~/.pie/agent/mcp.json` | Global — applies to all projects |
| `.pie/mcp.json` | Project — overrides global per server |

Project config takes precedence over global config. Settings merge shallowly; servers override per-name.

### Schema

```typescript
{
  settings?: {
    toolPrefix?: string;           // default: "mcp"
    requestTimeoutMs?: number;      // default: 30000
  };
  mcpServers: {
    [name: string]: ServerConfig;
  };
}
```

### Server Config

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `command` | string | stdio only | — | Executable to spawn (e.g. `"npx"`, `"uvx"`, `"node"`) |
| `args` | string[] | no | `[]` | Arguments passed to the command |
| `env` | Record<string,string> | no | — | Extra environment variables for the child process |
| `transport` | `"stdio"` \| `"streamable-http"` \| `"sse"` | no | `"stdio"` | Transport protocol |
| `url` | string | http/sse only | — | Server URL (e.g. `"https://mcp.example.com/mcp"`) |
| `headers` | Record<string,string> | no | — | Static HTTP headers (for API-key auth) |
| `lifecycle` | `"eager"` \| `"lazy"` | no | `"lazy"` | Auto-start vs manual `/mcp:start` |
| `requestTimeoutMs` | number | no | global | Per-request timeout override |

---

## Transports

### stdio (subprocess)

Spawns the server as a child process, communicates over stdin/stdout JSON-RPC.

```jsonc
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "transport": "stdio"
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@context7/mcp"],
      "transport": "stdio",
      "lifecycle": "lazy"
    }
  }
}
```

### streamable-http (HTTP-based)

Connect to an MCP server over HTTP POST with JSON-RPC. Uses simple request/response POST; streaming responses are not yet supported.

```jsonc
{
  "mcpServers": {
    "supabase": {
      "transport": "streamable-http",
      "url": "https://mcp.supabase.com/mcp",
      "lifecycle": "eager"
    },
    "deepsource": {
      "transport": "streamable-http",
      "url": "https://mcp.deepsource.io/mcp",
      "lifecycle": "eager",
      "headers": {
        "Authorization": "Bearer ${DEEPSOURCE_API_KEY}"
      }
    }
  }
}
```

### sse (legacy Server-Sent Events)

For older MCP servers using SSE transport:

```jsonc
{
  "mcpServers": {
    "legacy-server": {
      "transport": "sse",
      "url": "https://example.com/sse",
      "lifecycle": "lazy"
    }
  }
}
```

---

## Lifecycle

### Eager

Auto-starts when the session begins. Use for servers that should always be available:

```jsonc
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "transport": "stdio",
      "lifecycle": "eager"
    }
  }
}
```

### Lazy

Manual start via `/mcp:start <name>`. Use for servers you don't always need (saves resources):

```jsonc
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@context7/mcp"],
      "transport": "stdio",
      "lifecycle": "lazy"
    }
  }
}
```

Start with: `/mcp:start context7`
Stop with: `/mcp:stop context7`

---

## Commands

| Command | Description |
|---------|-------------|
| `/mcp` | Show status of all configured servers and tool count |
| `/mcp <name>` | Show detailed status for one server (state, retries, last error) |
| `/mcp:start <name>` | Start a lazy server (or restart an errored one) |
| `/mcp:stop <name>` | Stop a running server and deactivate its tools |

**Example output** for `/mcp`:

```
MCP Servers:
  ✓ filesystem: connected (3 tools)
  ○ context7: stopped
  ✗ github: error - ECONNREFUSED

3 MCP tools registered
```

---

## Tool Naming

MCP tools are registered with Pi as `mcp_<server>_<tool>`:

- Names are sanitized to `[a-zA-Z0-9_]`
- Max length 64 characters (truncated with hash suffix to avoid collisions)
- Configurable via `settings.toolPrefix`

If a server name is `github` and its tool is `create_issue`, the LLM calls it as `mcp_github_create_issue`.

---

## Examples

### Filesystem access

```jsonc
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
      "transport": "stdio",
      "lifecycle": "eager"
    }
  }
}
```

Tools available: `mcp_filesystem_read_file`, `mcp_filesystem_write_file`, `mcp_filesystem_list_directory`, etc.

### Context7 (library docs lookup)

```jsonc
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@context7/mcp"],
      "transport": "stdio",
      "lifecycle": "lazy"
    }
  }
}
```

Then `/mcp:start context7` to begin. Tools: `mcp_context7_get-library-docs`, etc.

### GitHub (HTTP transport)

```jsonc
{
  "mcpServers": {
    "github": {
      "transport": "streamable-http",
      "url": "https://api.github.com/mcp",
      "headers": {
        "Authorization": "Bearer ${GITHUB_TOKEN}"
      },
      "lifecycle": "eager"
    }
  }
}
```

### Database (Supabase)

```jsonc
{
  "mcpServers": {
    "supabase": {
      "transport": "streamable-http",
      "url": "https://mcp.supabase.com/mcp",
      "lifecycle": "eager"
    }
  }
}
```

### Multiple servers (parallel)

```jsonc
{
  "settings": {
    "requestTimeoutMs": 60000
  },
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "transport": "stdio",
      "lifecycle": "eager"
    },
    "supabase": {
      "transport": "streamable-http",
      "url": "https://mcp.supabase.com/mcp",
      "lifecycle": "eager"
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@context7/mcp"],
      "transport": "stdio",
      "lifecycle": "lazy"
    }
  }
}
```

---

## Security

> **Extensions run with your full system permissions.** MCP servers are equivalent — they can execute arbitrary code, read/write files, and access network. Only install servers from sources you trust.

- stdio servers inherit your shell environment; use the `env` field to restrict what they see
- HTTP servers should use `headers` for API keys, not env vars
- Project-local config (`.pie/mcp.json`) is only loaded for trusted projects
- API keys can reference env vars with `$VAR_NAME` or `${VAR_NAME}` syntax in headers

---

## Troubleshooting

### Server not appearing in `/mcp`

- Check config file syntax: `cat ~/.pie/agent/mcp.json | jq .`
- Verify binary is reachable: `which npx` for stdio servers
- Check stderr logs in `/mcp <name>` — error message is shown there
- For lazy servers, run `/mcp:start <name>` first

### "spawn ENOENT"

The `command` doesn't exist. Use absolute path or ensure it's in PATH.

### Tools not showing up in LLM

- Run `/mcp` to verify the server is in `connected` state
- Tools activate/deactivate automatically as servers connect/disconnect
- If a tool fails after reconnection, `/mcp:stop` then `/mcp:start` the server

### Timeouts

Increase `requestTimeoutMs` in settings or per-server. Default 30s may be too low for slow tools.

### Reconnection

Automatic reconnection is not yet supported. If a server fails, run `/mcp:stop <name>` followed by `/mcp:start <name>` to reconnect.

---

## MCP Spec Compliance

| Feature | Status |
|---------|--------|
| `stdio` transport | Supported |
| `streamable-http` transport | Supported |
| `sse` transport (legacy) | Supported |
| Cursor-based `tools/list` pagination | Not yet supported |
| `tools/call` with parameters | Supported |
| `notifications/tools/list_changed` (live refresh) | Not yet supported |
| `AbortSignal` → `notifications/cancelled` | Supported |
| Tool annotations (`readOnlyHint`, etc.) | Surfaced in tool descriptions |
| OAuth 2.1 flow | Not yet supported in built-in (use API key headers for now) |
| Resources bridge | Not yet (v2) |
| Prompts bridge | Not yet (v2) |

---

## See Also

- [MCP Specification](https://modelcontextprotocol.io)
- [MCP Server Registry](https://github.com/modelcontextprotocol/servers) — official list of reference servers
- [extensions.md](extensions.md) — Pi's extension API (used to build MCP servers)