// Chat interface for Neotoma
let chatMessages = [];
let isChatOpen = false;
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

function openChat() {
  if (chatEls.chatPanel) {
    chatEls.chatPanel.classList.add('open');
    isChatOpen = true;
    if (chatEls.chatInput) {
      chatEls.chatInput.focus();
    }
  }
}

function closeChat() {
  if (chatEls.chatPanel) {
    chatEls.chatPanel.classList.remove('open');
    isChatOpen = false;
  }
}

// Global function for inline onclick fallback
window.toggleChat = function(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  console.log('toggleChat called, isChatOpen:', isChatOpen);
  if (isChatOpen) {
    closeChat();
  } else {
    openChat();
  }
};

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
    chatToggle: document.getElementById('chatToggle'),
    closeChat: document.getElementById('closeChat'),
    chatMessages: document.getElementById('chatMessages'),
    chatInput: document.getElementById('chatInput'),
    chatSend: document.getElementById('chatSend'),
  };

  console.log('Chat init - elements:', chatEls);

  if (!chatEls.chatPanel || !chatEls.chatToggle) {
    console.warn('Chat elements not found', {
      chatPanel: !!chatEls.chatPanel,
      chatToggle: !!chatEls.chatToggle,
    });
    // Retry after a short delay
    setTimeout(initChat, 100);
    return;
  }

  // Event listener
  const toggleHandler = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    console.log('Chat toggle clicked, isChatOpen:', isChatOpen);
    if (isChatOpen) {
      closeChat();
    } else {
      openChat();
    }
  };

  // Remove any existing listeners by cloning the button
  const newToggle = chatEls.chatToggle.cloneNode(true);
  chatEls.chatToggle.parentNode?.replaceChild(newToggle, chatEls.chatToggle);
  chatEls.chatToggle = newToggle;

  // Add event listener
  chatEls.chatToggle.addEventListener('click', toggleHandler);

  if (chatEls.closeChat) {
    chatEls.closeChat.addEventListener('click', closeChat);
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

  // Add welcome message
  addMessage('assistant', 'Hello! I can help you query and understand your Neotoma records. Try asking me about your data, like "Show me all transactions" or "What notes do I have?"');
  
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

