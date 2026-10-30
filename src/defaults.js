const tile = (name, url, icon, extra) => ({ name, url, icon: `assets/icons/${icon}`, ...extra });

const LINKEDIN = tile('LinkedIn', 'https://www.linkedin.com/', 'linkedin.svg');
const YOUTUBE = tile('YouTube', 'https://www.youtube.com/', 'youtube.svg');
const COURSERA = tile('Coursera', 'https://www.coursera.org/', 'coursera.svg');
const KAGGLE = tile('Kaggle', 'https://www.kaggle.com/', 'kaggle.svg');

export const defaultLinks = () => [
  { id: 'bookmarks', title: 'Bookmarks', hue: 'pink', style: 'text', items: [] },
  {
    id: 'workspace',
    title: 'Google Workspace',
    hue: 'blue',
    items: [
      tile('Gmail', 'https://mail.google.com/', 'gmail.svg'),
      tile('Calendar', 'https://calendar.google.com/', 'calendar.svg', { new: 'https://cal.new/', newLabel: 'New event' }),
      tile('Meet', 'https://meet.google.com/', 'meet.svg', { new: 'https://meet.new/', newLabel: 'Start a meeting' }),
      tile('Drive', 'https://drive.google.com/', 'drive.svg', { new: 'https://drive.new/', newLabel: 'New folder' }),
      tile('Docs', 'https://docs.google.com/document/', 'docs.png', { new: 'https://docs.new/', newLabel: 'New document' }),
      tile('Sheets', 'https://docs.google.com/spreadsheets/', 'sheets.png', { new: 'https://sheets.new/', newLabel: 'New spreadsheet' }),
      tile('Slides', 'https://docs.google.com/presentation/', 'slides.png', { new: 'https://slides.new/', newLabel: 'New presentation' }),
      tile('Forms', 'https://docs.google.com/forms/', 'forms.png', { new: 'https://forms.new/', newLabel: 'New form' }),
      tile('Keep', 'https://keep.google.com/', 'keep.png', { new: 'https://keep.new/', newLabel: 'New note' }),
      tile('Chat', 'https://chat.google.com/', 'chat.png'),
      tile('Photos', 'https://photos.google.com/', 'photos.svg'),
      tile('Maps', 'https://maps.google.com/', 'maps.svg'),
    ],
  },
  {
    id: 'ai',
    title: 'AI tools',
    hue: 'purple',
    items: [
      tile('Claude', 'https://claude.ai/new', 'claude.svg'),
      tile('ChatGPT', 'https://chatgpt.com/', 'chatgpt.svg'),
      tile('Gemini', 'https://gemini.google.com/app', 'gemini.svg'),
      tile('NotebookLM', 'https://notebooklm.google.com/', 'notebooklm.svg'),
      tile('AI Studio', 'https://aistudio.google.com/prompts/new_chat', 'aistudio.svg'),
      tile('Perplexity', 'https://www.perplexity.ai/', 'perplexity.svg'),
      tile('Copilot', 'https://copilot.microsoft.com/', 'copilot.svg'),
      tile('Grok', 'https://grok.com/', 'grok.svg'),
      tile('DeepSeek', 'https://chat.deepseek.com/', 'deepseek.svg'),
    ],
  },
  {
    id: 'social',
    title: 'Social',
    hue: 'green',
    items: [
      LINKEDIN,
      tile('Instagram', 'https://www.instagram.com/', 'instagram.svg'),
      tile('X', 'https://x.com/', 'x.svg'),
      tile('Facebook', 'https://www.facebook.com/', 'facebook.svg'),
      tile('WhatsApp', 'https://web.whatsapp.com/', 'whatsapp.svg'),
      YOUTUBE,
      tile('Reddit', 'https://www.reddit.com/', 'reddit.svg'),
    ],
  },
  {
    id: 'extra',
    title: 'Ideas and tools',
    hue: 'orange',
    items: [
      tile('Pinterest', 'https://www.pinterest.com/', 'pinterest.svg'),
      tile('Figma', 'https://www.figma.com/files/', 'figma.svg'),
      tile('Dribbble', 'https://dribbble.com/', 'dribbble.svg'),
      tile('GitHub', 'https://github.com/', 'github.svg'),
      tile('Notion', 'https://www.notion.so/', 'notion.svg'),
      COURSERA,
      KAGGLE,
      ...learning(),
    ],
  },
];

function learning() {
  return [
    tile('freeCodeCamp', 'https://www.freecodecamp.org/learn/', 'freecodecamp.svg'),
    tile('Udemy', 'https://www.udemy.com/', 'udemy.svg'),
    tile('Khan Academy', 'https://www.khanacademy.org/', 'khanacademy.svg'),
  ];
}

// Brings an older saved link list up to date. Each step runs once, so anything removed later stays removed.
export function upgradeLinks(links, from) {
  const extra = links.find((g) => g.id === 'extra');
  if (from < 2 && extra) {
    for (const item of [LINKEDIN, COURSERA, KAGGLE]) {
      if (!extra.items.some((i) => i.url === item.url)) extra.items.push({ ...item });
    }
  }
  if (from < 3 && extra && !links.some((g) => g.id === 'social')) {
    // LinkedIn and YouTube move to Social, but only if the user still has them.
    const moving = [LINKEDIN.url, YOUTUBE.url];
    const had = extra.items.filter((i) => moving.includes(i.url)).map((i) => i.url);
    extra.items = extra.items.filter((i) => !moving.includes(i.url));
    const social = defaultLinks().find((g) => g.id === 'social');
    social.items = social.items.filter((i) => !moving.includes(i.url) || had.includes(i.url));
    links.splice(links.indexOf(extra), 0, social);
    for (const item of learning()) {
      if (!extra.items.some((i) => i.url === item.url)) extra.items.push(item);
    }
  }
  return links;
}

export const defaultSettings = () => ({
  theme: 'auto',
  hour12: true,
  mirror: true,
  name: '',
  portfolio: '',
  onboarded: false,
  sideMin: false,
  todayMin: false,
  calendar: true,
  ical: '',
  docs: false,
  motion: 'dots',
  photo: '',
  blur: 8,
  dim: 30,
});

export const welcomeNote = () => ({
  id: crypto.randomUUID(),
  body: '# Welcome to Tabloom\n\nDrag me anywhere. Click to open me full page.\n\n- **Markdown** works\n- Plain text works too\n- Press `N` for a new note',
  mode: 'md',
  hue: 'yellow',
  x: 0,
  y: 0,
  rot: -1.2,
  z: 1,
  created: Date.now(),
  updated: Date.now(),
});

// Top of the bookmarks bar, used on install.
export async function barBookmarks(limit = 15) {
  const [bar] = await chrome.bookmarks.getChildren('0');
  const nodes = await chrome.bookmarks.getChildren(bar.id);
  return nodes.filter((n) => n.url).slice(0, limit).map((n) => ({ name: n.title || new URL(n.url).hostname, url: n.url }));
}

// Every browser bookmark with its folder, for the picker.
export async function allBookmarks() {
  const out = [];
  const walk = (node, folder) => {
    for (const child of node.children ?? []) {
      if (child.url) out.push({ name: child.title || new URL(child.url).hostname, url: child.url, folder });
      else walk(child, child.title);
    }
  };
  walk((await chrome.bookmarks.getTree())[0], '');
  return out;
}
