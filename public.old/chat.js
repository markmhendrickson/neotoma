// Chat interface for Neotoma
let chatMessages = [];
let chatEls = {};

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatMessage(content) {
  // Simple markdown-like formatting
  return escapeHtml(content)
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function addMessage(role, content, records = null) {
  const message = { role, content, timestamp: new Date() };
  chatMessages.push(message);

  const messageEl = document.createElement('div');
  messageEl.className = `chat-message chat-message-${role}`;

  let contentHtml = formatMessage(content);

  // If records were queried, show a summary
  if (records && records.length > 0 && role === 'assistant') {
    contentHtml += `<div class="chat-records-summary">Found ${records.length} record${records.length !== 1 ? 's' : ''}</div>`;
  }

  messageEl.innerHTML = `
    <div class="chat-message-content">${contentHtml}</div>
    <div class="chat-message-time">${message.timestamp.toLocaleTimeString()}</div>
  `;

  if (chatEls.chatMessages) {
    chatEls.chatMessages.appendChild(messageEl);
    chatEls.chatMessages.scrollTop = chatEls.chatMessages.scrollHeight;
  }
}

function addLoadingMessage() {
  const loadingEl = document.createElement('div');
  loadingEl.className = 'chat-message chat-message-assistant chat-message-loading';
  loadingEl.id = 'chatLoading';
  loadingEl.innerHTML = `
    <div class="chat-message-content">
      <span class="chat-typing-indicator">
        <span></span><span></span><span></span>
      </span>
    </div>
  `;
  if (chatEls.chatMessages) {
    chatEls.chatMessages.appendChild(loadingEl);
    chatEls.chatMessages.scrollTop = chatEls.chatMessages.scrollHeight;
  }
}

function removeLoadingMessage() {
  const loadingEl = document.getElementById('chatLoading');
  if (loadingEl) {
    loadingEl.remove();
  }
}

async function handleFileUpload(files) {
  if (files.length === 0) return;

  // Get API base and token from existing settings
  let apiBase = 'http://localhost:8080';
  let bearerToken = '';

  try {
    apiBase = localStorage.getItem('apiBase') || window.location.origin;
    bearerToken = localStorage.getItem('bearerToken') || '';
  } catch (e) {
    console.warn('Failed to load settings', e);
  }

  if (!bearerToken) {
    addMessage('assistant', 'Please set your Bearer Token in the settings above to upload files.');
    return;
  }

  const uploadItems = [];
  files.forEach((file) => {
    const item = document.createElement('div');
    item.className = 'chat-upload-item';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'chat-upload-name';
    nameSpan.textContent = file.name;
    const statusSpan = document.createElement('span');
    statusSpan.className = 'chat-upload-status pending';
    statusSpan.textContent = 'Uploading...';
    item.appendChild(nameSpan);
    item.appendChild(statusSpan);
    uploadItems.push({ file, element: item, statusEl: statusSpan });
    if (chatEls.chatUploadProgress) {
      chatEls.chatUploadProgress.appendChild(item);
    }
  });

  for (const { file, element, statusEl } of uploadItems) {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${apiBase}/upload_file`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
        },
        body: formData,
      });

      if (response.ok) {
        const record = await response.json();
        if (statusEl) {
          statusEl.textContent = '✓';
          statusEl.className = 'chat-upload-status success';
        }
        addMessage('assistant', `File "${file.name}" uploaded successfully.`);
        // Refresh records table to show new record
        if (typeof window.fetchRecords === 'function') {
          setTimeout(() => window.fetchRecords(), 500);
        }
        // Remove item after 2 seconds
        setTimeout(() => {
          if (element.parentNode) {
            element.remove();
          }
        }, 2000);
      } else {
        let errorMessage = 'Upload failed';
        if (response.status === 401 || response.status === 403) {
          errorMessage = 'Unauthorized - check your Bearer Token';
        } else {
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (e) {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      if (statusEl) {
        statusEl.textContent = '✗';
        statusEl.className = 'chat-upload-status error';
      }
      addMessage('assistant', `Failed to upload "${file.name}": ${error.message}`);
      // Remove item after 3 seconds on error
      setTimeout(() => {
        if (element.parentNode) {
          element.remove();
        }
      }, 3000);
    }
  }
}

async function sendMessage() {
  const input = chatEls.chatInput;
  if (!input || !input.value.trim()) {
    return;
  }

  const userMessage = input.value.trim();
  input.value = '';

  // Add user message to UI
  addMessage('user', userMessage);

  // Add loading indicator
  addLoadingMessage();

  // Get API base and token from existing settings (from app.js)
  let apiBase = 'http://localhost:8080';
  let bearerToken = '';

  try {
    apiBase = localStorage.getItem('apiBase') || window.location.origin;
    bearerToken = localStorage.getItem('bearerToken') || '';
  } catch (e) {
    console.warn('Failed to load settings', e);
  }

  if (!bearerToken) {
    removeLoadingMessage();
    addMessage('assistant', 'Please set your Bearer Token in the settings above to use the chat feature.');
    return;
  }

  try {
    // Build messages array (exclude system messages from history)
    const messagesToSend = chatMessages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    const response = await fetch(`${apiBase}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({
        messages: messagesToSend,
      }),
    });

    removeLoadingMessage();

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Unauthorized - check your Bearer Token');
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
    }

    const data = await response.json();
    const assistantContent = data.message?.content || 'No response received';
    const recordsQueried = data.records_queried || null;

    addMessage('assistant', assistantContent, recordsQueried);
  } catch (error) {
    removeLoadingMessage();
    console.error('Chat error:', error);
    addMessage('assistant', `Error: ${error.message || 'Failed to send message'}`);
  }
}

// Initialize chat interface
function initChat() {
  // Get DOM elements
  chatEls = {
    chatPanel: document.getElementById('chatPanel'),
    chatMessages: document.getElementById('chatMessages'),
    chatInput: document.getElementById('chatInput'),
    chatFileInput: document.getElementById('chatFileInput'),
    chatSend: document.getElementById('chatSend'),
    chatUploadProgress: document.getElementById('chatUploadProgress'),
  };

  console.log('Chat init - elements:', chatEls);

  if (!chatEls.chatPanel || !chatEls.chatMessages) {
    console.warn('Chat elements not found', {
      chatPanel: !!chatEls.chatPanel,
      chatMessages: !!chatEls.chatMessages,
    });
    // Retry after a short delay
    setTimeout(initChat, 100);
    return;
  }

  if (chatEls.chatSend) {
    chatEls.chatSend.addEventListener('click', sendMessage);
  }

  if (chatEls.chatInput) {
    chatEls.chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // File upload - drag and drop on chat messages area
  if (chatEls.chatMessages) {
    chatEls.chatMessages.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      chatEls.chatMessages.classList.add('drag-over');
    });

    chatEls.chatMessages.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      chatEls.chatMessages.classList.remove('drag-over');
    });

    chatEls.chatMessages.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      chatEls.chatMessages.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        handleFileUpload(files);
      }
    });
  }

  // File input for click-to-upload (optional, can be triggered by other UI elements)
  if (chatEls.chatFileInput) {
    chatEls.chatFileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        handleFileUpload(files);
        // Reset input
        e.target.value = '';
      }
    });
  }

  // Add welcome message
  addMessage('assistant', 'Hello! I can help you query and understand your Neotoma records. Try asking me about your data, like "Show me all transactions" or "What notes do I have?" You can also drag and drop files here to upload them.');
  
  console.log('Chat initialized successfully');
}

// Initialize when DOM is ready - use multiple strategies
function tryInitChat() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initChat, 50);
    });
  } else {
    // DOM already loaded, but wait a bit for other scripts
    setTimeout(initChat, 100);
  }
}

tryInitChat();

