export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  // Default action to 'contents' if not specified
  const action = url.searchParams.get('action') || 'contents';
  const method = request.method;

  // GitHub Config from Environment
  const GITHUB_TOKEN = env.GITHUB_TOKEN;
  let GITHUB_REPO = env.GITHUB_REPO || '';
  if (GITHUB_REPO.includes('github.com/')) {
    GITHUB_REPO = GITHUB_REPO.split('github.com/')[1].split('?')[0].replace(/\/$/, '');
  }
  
  let GITHUB_BRANCH = env.GITHUB_BRANCH || 'main';
  if (GITHUB_BRANCH.includes('git branch -M ')) {
    GITHUB_BRANCH = GITHUB_BRANCH.split('git branch -M ')[1].trim();
  }
  GITHUB_BRANCH = GITHUB_BRANCH.trim();

  const githubHeaders = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'RPG-Asset-Manager-Cloudflare'
  };

  // Helper for JSON responses
  const jsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
      return jsonResponse({ error: "Configuração do GitHub ausente no Cloudflare (GITHUB_TOKEN ou GITHUB_REPO)" }, 400);
    }

    // ROUTER
    switch (action) {
      case 'config':
        return jsonResponse({
          hasToken: !!GITHUB_TOKEN,
          repo: GITHUB_REPO,
          branch: GITHUB_BRANCH
        });

      case 'contents': {
        const path = url.searchParams.get('path') || "";
        let ghUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`;
        let response = await fetch(ghUrl, { headers: githubHeaders });

        if (!response.ok && response.status === 404 && !path) {
          ghUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`;
          response = await fetch(ghUrl, { headers: githubHeaders });
        }

        if (!response.ok) {
          if (response.status === 404 && !path) return jsonResponse([]);
          const err = await response.json();
          return jsonResponse({ error: err.message }, response.status);
        }

        const data = await response.json();
        return jsonResponse(Array.isArray(data) ? data : [data]);
      }

      case 'folders': {
        const ghUrl = `https://api.github.com/repos/${GITHUB_REPO}/git/trees/${GITHUB_BRANCH}?recursive=1`;
        const response = await fetch(ghUrl, { headers: githubHeaders });
        if (!response.ok) return jsonResponse({ error: "Erro ao buscar árvore de diretórios" }, 500);
        const data = await response.json();
        const folders = data.tree.filter(i => i.type === 'tree').map(i => i.path);
        return jsonResponse(['', ...folders]);
      }

      case 'upload': {
        if (method !== 'POST') return jsonResponse({ error: "Method not allowed" }, 405);
        const { path, content, message } = await request.json();
        const cleanPath = path.replace(/\/+/g, '/').replace(/^\//, '');
        const ghUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${cleanPath}`;

        // Check for SHA
        let sha;
        const checkRes = await fetch(`${ghUrl}?ref=${GITHUB_BRANCH}`, { headers: githubHeaders });
        if (checkRes.ok) {
          const fileData = await checkRes.json();
          sha = fileData.sha;
        }

        const body = {
          message: message || `Upload ${cleanPath}`,
          content,
          branch: GITHUB_BRANCH,
          sha
        };

        const uploadRes = await fetch(ghUrl, {
          method: 'PUT',
          headers: githubHeaders,
          body: JSON.stringify(body)
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          return jsonResponse({ error: err.message }, uploadRes.status);
        }
        return jsonResponse({ success: true });
      }

      case 'folder': {
        const { path } = await request.json();
        const gitkeepPath = `${path}/.gitkeep`.replace(/\/+/g, '/').replace(/^\//, '');
        const ghUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${gitkeepPath}`;
        const body = {
          message: `Create folder: ${path}`,
          content: "", // Empty string is fine for .gitkeep
          branch: GITHUB_BRANCH
        };
        const response = await fetch(ghUrl, {
          method: 'PUT',
          headers: githubHeaders,
          body: JSON.stringify(body)
        });
        if (!response.ok) return jsonResponse({ error: "Erro ao criar pasta" }, 500);
        return jsonResponse({ success: true });
      }

      case 'move': {
        const { oldPath, newPath } = await request.json();
        // 1. Get old
        const oldUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${oldPath}?ref=${GITHUB_BRANCH}`;
        const oldRes = await fetch(oldUrl, { headers: githubHeaders });
        if (!oldRes.ok) return jsonResponse({ error: "Arquivo de origem não encontrado" }, 404);
        const oldData = await oldRes.json();

        // 2. Create new
        const newUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${newPath}`;
        const createRes = await fetch(newUrl, {
          method: 'PUT',
          headers: githubHeaders,
          body: JSON.stringify({
            message: `Move ${oldPath} to ${newPath}`,
            content: oldData.content,
            branch: GITHUB_BRANCH
          })
        });
        if (!createRes.ok) return jsonResponse({ error: "Erro ao criar novo arquivo" }, 500);

        // 3. Delete old
        await fetch(oldUrl.split('?')[0], {
          method: 'DELETE',
          headers: githubHeaders,
          body: JSON.stringify({
            message: `Delete old after move`,
            sha: oldData.sha,
            branch: GITHUB_BRANCH
          })
        });
        return jsonResponse({ success: true });
      }

      case 'delete': {
        const { path, sha, type } = await request.json();
        
        let targetPath = path;
        let targetSha = sha;

        // If it's a directory, we try to delete the .gitkeep file inside it
        if (type === 'dir') {
          const gitkeepPath = `${path}/.gitkeep`.replace(/\/+/g, '/').replace(/^\//, '');
          const checkRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${gitkeepPath}?ref=${GITHUB_BRANCH}`, { headers: githubHeaders });
          
          if (!checkRes.ok) {
            return jsonResponse({ error: "Para excluir uma pasta, ela deve estar vazia ou conter apenas o arquivo .gitkeep. Exclua os arquivos internos primeiro." }, 400);
          }
          
          const gitkeepData = await checkRes.json();
          targetPath = gitkeepPath;
          targetSha = gitkeepData.sha;
        }

        const ghUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${targetPath}`;
        const response = await fetch(ghUrl, {
          method: 'DELETE',
          headers: githubHeaders,
          body: JSON.stringify({
            message: `Delete ${targetPath}`,
            sha: targetSha,
            branch: GITHUB_BRANCH
          })
        });

        if (!response.ok) {
          const err = await response.json();
          return jsonResponse({ error: err.message || "Erro ao excluir" }, response.status);
        }
        return jsonResponse({ success: true });
      }

      default:
        return jsonResponse({ error: "Action not found" }, 404);
    }
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}
