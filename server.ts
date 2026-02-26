import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase limit for base64 uploads
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // GitHub API Helpers
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  // Cleanup repo name in case user pasted full URL
  let GITHUB_REPO = process.env.GITHUB_REPO || '';
  if (GITHUB_REPO.includes('github.com/')) {
    GITHUB_REPO = GITHUB_REPO.split('github.com/')[1].split('?')[0].replace(/\/$/, '');
  }
  
  let GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
  // Cleanup branch name in case user pasted a command like "git branch -M main"
  if (GITHUB_BRANCH.includes('git branch -M ')) {
    GITHUB_BRANCH = GITHUB_BRANCH.split('git branch -M ')[1].trim();
  } else if (GITHUB_BRANCH.includes('git checkout -b ')) {
    GITHUB_BRANCH = GITHUB_BRANCH.split('git checkout -b ')[1].trim();
  }
  GITHUB_BRANCH = GITHUB_BRANCH.trim();
  const GITHUB_PATH = process.env.GITHUB_PATH || 'uploads';

  const githubHeaders = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'RPG-Asset-Manager'
  };

  // Proxy /functions to support Cloudflare Pages structure in preview
  app.all("/functions", async (req, res) => {
    const { onRequest } = await import('./functions/[[path]].js');
    
    // Mock Cloudflare context
    const context = {
      request: {
        url: `http://localhost:3000${req.url}`,
        method: req.method,
        json: () => Promise.resolve(req.body),
      },
      env: {
        GITHUB_TOKEN: process.env.GITHUB_TOKEN,
        GITHUB_REPO: process.env.GITHUB_REPO,
        GITHUB_BRANCH: process.env.GITHUB_BRANCH,
      }
    };

    try {
      const response = await onRequest(context);
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API Routes (Legacy support for preview if needed)
  app.get("/api/config", (req, res) => {
    res.json({
      hasToken: !!GITHUB_TOKEN,
      repo: GITHUB_REPO,
      branch: GITHUB_BRANCH,
      path: GITHUB_PATH
    });
  });

  // List contents of a specific path
  app.get("/api/contents", async (req, res) => {
    const pathParam = req.query.path as string || "";
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
      return res.status(400).json({ error: "GitHub configuration missing" });
    }

    try {
      // Try with branch first
      let url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${pathParam}?ref=${GITHUB_BRANCH}`;
      let response = await fetch(url, { headers: githubHeaders });

      // If 404, it might be an empty repo or wrong branch, try without ref
      if (!response.ok && response.status === 404 && !pathParam) {
        url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${pathParam}`;
        response = await fetch(url, { headers: githubHeaders });
      }

      if (!response.ok) {
        const errorData = await response.json();
        // Special handling for empty repo
        if (response.status === 404 && !pathParam) {
          return res.json([]); // Return empty list for empty root
        }
        throw new Error(errorData.message || "Failed to fetch contents");
      }

      const data = await response.json();
      res.json(Array.isArray(data) ? data : [data]);
    } catch (error: any) {
      console.error("Error fetching contents:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create a new folder (via .gitkeep)
  app.post("/api/folder", async (req, res) => {
    const { path: folderPath } = req.body;
    if (!GITHUB_TOKEN || !GITHUB_REPO) return res.status(400).json({ error: "Config missing" });

    try {
      const gitkeepPath = `${folderPath}/.gitkeep`.replace(/\/+/g, '/').replace(/^\//, '');
      const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${gitkeepPath}`;

      const body = {
        message: `Create folder: ${folderPath}`,
        content: Buffer.from("").toString('base64'),
        branch: GITHUB_BRANCH
      };

      const response = await fetch(url, {
        method: 'PUT',
        headers: githubHeaders,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create folder");
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Upload file
  app.post("/api/upload", async (req, res) => {
    const { path: filePath, content, message } = req.body;
    if (!GITHUB_TOKEN || !GITHUB_REPO) return res.status(400).json({ error: "Config missing" });

    try {
      const cleanPath = filePath.replace(/\/+/g, '/').replace(/^\//, '');
      const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${cleanPath}`;

      // Check if file exists to get SHA (for updates)
      let sha;
      const checkRes = await fetch(`${url}?ref=${GITHUB_BRANCH}`, { headers: githubHeaders });
      if (checkRes.ok) {
        const fileData = await checkRes.json();
        sha = fileData.sha;
      }

      const body: any = {
        message: message || `Upload ${cleanPath}`,
        content: content,
        branch: GITHUB_BRANCH
      };
      if (sha) body.sha = sha;

      const response = await fetch(url, {
        method: 'PUT',
        headers: githubHeaders,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("GitHub API Error Response:", {
          status: response.status,
          statusText: response.statusText,
          data: errorData
        });
        throw new Error(errorData.message || `GitHub Error: ${response.statusText}`);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // List all directories recursively for folder selection
  app.get("/api/folders", async (req, res) => {
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
      return res.status(400).json({ error: "GitHub configuration missing" });
    }

    try {
      // Use the recursive tree API to get all items
      const url = `https://api.github.com/repos/${GITHUB_REPO}/git/trees/${GITHUB_BRANCH}?recursive=1`;
      const response = await fetch(url, { headers: githubHeaders });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to fetch tree");
      }

      const data = await response.json();
      // Filter only for trees (directories)
      const folders = data.tree
        .filter((item: any) => item.type === 'tree')
        .map((item: any) => item.path);
      
      // Add root
      res.json(['', ...folders]);
    } catch (error: any) {
      console.error("Error fetching folders:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Rename/Move file or folder
  // Note: For folders, this is complex as GitHub API doesn't support folder move directly.
  // This implementation handles single file move.
  app.post("/api/move", async (req, res) => {
    const { oldPath, newPath, sha } = req.body;
    if (!GITHUB_TOKEN || !GITHUB_REPO) return res.status(400).json({ error: "Config missing" });

    try {
      // 1. Get the content of the old file
      const oldUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${oldPath}?ref=${GITHUB_BRANCH}`;
      const oldRes = await fetch(oldUrl, { headers: githubHeaders });
      if (!oldRes.ok) throw new Error("Could not find source file");
      const oldData = await oldRes.json();

      // 2. Create the new file
      const newUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${newPath}`;
      const createBody = {
        message: `Move ${oldPath} to ${newPath}`,
        content: oldData.content,
        branch: GITHUB_BRANCH
      };
      const createRes = await fetch(newUrl, {
        method: 'PUT',
        headers: githubHeaders,
        body: JSON.stringify(createBody)
      });
      if (!createRes.ok) throw new Error("Failed to create new file");

      // 3. Delete the old file
      const deleteBody = {
        message: `Delete old file after move: ${oldPath}`,
        sha: oldData.sha,
        branch: GITHUB_BRANCH
      };
      await fetch(oldUrl.split('?')[0], {
        method: 'DELETE',
        headers: githubHeaders,
        body: JSON.stringify(deleteBody)
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete file
  app.delete("/api/delete", async (req, res) => {
    const { path: filePath, sha } = req.body;
    if (!GITHUB_TOKEN || !GITHUB_REPO) return res.status(400).json({ error: "Config missing" });

    try {
      const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;
      const body = {
        message: `Delete ${filePath}`,
        sha: sha,
        branch: GITHUB_BRANCH
      };

      const response = await fetch(url, {
        method: 'DELETE',
        headers: githubHeaders,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Delete failed");
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
