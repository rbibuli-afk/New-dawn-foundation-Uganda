const http = require('http');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { ensureMusicCovers } = require('./music-cover-assistant');

const root = __dirname;
const port = Number(process.env.PORT || 3000);
let tokenCache = { value: '', expiresAt: 0 };
let mongoClient;

function loadEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}

async function spotifyToken() {
  if (tokenCache.value && tokenCache.expiresAt > Date.now()) return tokenCache.value;
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    return null;
  }
  const credentials = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!response.ok) return null;
  const data = await response.json();
  tokenCache = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return tokenCache.value;
}

async function searchTrack(query) {
  try {
    const token = await spotifyToken();
    if (!token) return null;
    const url = `https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return null;
    const data = await response.json();
    const track = data.tracks.items[0];
    if (!track) return null;
    return { id: track.id, name: track.name, artist: track.artists.map((artist) => artist.name).join(', ') };
  } catch {
    return null;
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function getDatabase() {
  if (!process.env.MONGODB_URI) return null;
  if (!mongoClient) {
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
  }
  return mongoClient.db(process.env.MONGODB_DB || 'new_dawn_foundation');
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 100000) reject(new Error('Request body is too large.'));
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    request.on('error', reject);
  });
}

function requiredText(value, field, maxLength = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

async function saveSubmission(collectionName, body) {
  const database = await getDatabase();
  if (!database) return false;
  await database.collection(collectionName).insertOne({ ...body, createdAt: new Date() });
  return true;
}

function serveFile(request, response) {
  const requested = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const filePath = path.resolve(root, `.${requested === '/' ? '/home.html' : requested}`);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon'
  };
  response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
}

loadEnv();
ensureMusicCovers().catch(() => console.log('Music cover assistant could not refresh covers.'));
http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === '/api/spotify/search') {
      const query = url.searchParams.get('q');
      if (!query || query.length > 200) return sendJson(response, 400, { error: 'A valid search query is required.' });
      const track = await searchTrack(query);
      if (!track) return sendJson(response, 404, { error: 'Spotify is unavailable right now. The page will keep showing the available music cards.' });
      return sendJson(response, 200, track);
    }
    if (request.method === 'POST' && url.pathname === '/api/volunteers') {
      const body = await readJson(request);
      const submission = {
        name: requiredText(body.name, 'Name', 120),
        email: requiredText(body.email, 'Email', 200),
        location: requiredText(body.location, 'Town or district', 120),
        availability: requiredText(body.availability, 'Availability', 80),
        interests: Array.isArray(body.interests) ? body.interests.map((interest) => requiredText(interest, 'Interest', 80)).slice(0, 10) : [],
        message: typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : ''
      };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submission.email)) return sendJson(response, 400, { error: 'Enter a valid email address.' });
      if (!await saveSubmission('volunteer_signups', submission)) return sendJson(response, 503, { error: 'MongoDB is not configured. Add MONGODB_URI to the server environment.' });
      return sendJson(response, 201, { message: 'Volunteer sign-up received.' });
    }
    if (request.method === 'POST' && url.pathname === '/api/contact') {
      const body = await readJson(request);
      const submission = {
        name: requiredText(body.name, 'Name', 120),
        email: requiredText(body.email, 'Email', 200),
        message: requiredText(body.message, 'Message', 3000)
      };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submission.email)) return sendJson(response, 400, { error: 'Enter a valid email address.' });
      if (!await saveSubmission('contact_messages', submission)) return sendJson(response, 503, { error: 'MongoDB is not configured. Add MONGODB_URI to the server environment.' });
      return sendJson(response, 201, { message: 'Message received.' });
    }
    serveFile(request, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}).listen(port, () => console.log(`New Dawn Foundation site: http://localhost:${port}`));
