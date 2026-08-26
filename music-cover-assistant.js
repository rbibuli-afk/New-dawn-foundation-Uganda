const fs = require('fs');
const path = require('path');

const coversDirectory = path.join(__dirname, 'assets', 'music-covers');
const tracks = [
  ['Fix You', 'Coldplay'],
  ['Here Comes the Sun', 'The Beatles'],
  ['Good Days', 'SZA'],
  ['Weightless', 'Marconi Union'],
  ['Suzanna', 'Sauti Sol'],
  ['Bloom', 'The Paper Kites'],
  ['River Flows in You', 'Yiruma'],
  ['Holocene', 'Bon Iver'],
  ['Sea of Love', 'Cat Power'],
  ['Turning Page', 'Sleeping at Last'],
  ['Nuvole Bianche', 'Ludovico Einaudi'],
  ['River', 'Leon Bridges'],
  ['Dancing Queen', 'ABBA'],
  ['Anti-Hero', 'Taylor Swift'],
  ['Not Like Us', 'Kendrick Lamar'],
  ['Water', 'Tyla'],
  ['Jerusalema', 'Master KG Nomcebo Zikode'],
  ['Three Little Birds', 'Bob Marley The Wailers'],
  ['Good as Hell', 'Lizzo'],
  ['Lovely Day', 'Bill Withers'],
  ['Walking on Sunshine', 'Katrina and the Waves'],
  ['Uptown Funk', 'Mark Ronson Bruno Mars'],
  ['Three Little Birds', 'Bob Marley The Wailers'],
  ['Waka Waka', 'Shakira'],
  ['Valerie', 'Amy Winehouse'],
  ['Stand by Me', 'Ben E. King'],
  ['Perfect', 'Ed Sheeran'],
  ['Someone Like You', 'Adele'],
  ['Ex-Factor', 'Lauryn Hill'],
  ['The Night We Met', 'Lord Huron'],
  ['Skinny Love', 'Bon Iver'],
  ['All I Want', 'Kodaline'],
  ['Breathe Me', 'Sia'],
  ['Hallelujah', 'Jeff Buckley'],
  ['Back to Black', 'Amy Winehouse'],
  ['The Scientist', 'Coldplay'],
  ['Liability', 'Lorde'],
  ['September', 'Earth Wind Fire'],
  ['Blinding Lights', 'The Weeknd'],
  ['Essence', 'Wizkid Tems'],
  ['Everything In Its Right Place', 'Radiohead'],
  ['So What', 'Miles Davis'],
  ['Clair de Lune', 'Claude Debussy'],
  ['Intro', 'The xx'],
  ['A Moment Apart', 'Odesza'],
  ['Take Five', 'Dave Brubeck'],
  ['Gymnopedie No. 1', 'Erik Satie'],
  ['Teardrop', 'Massive Attack'],
  ['Porcelain', 'Moby'],
  ['Lean on Me', 'Bill Withers'],
  ['Count on Me', 'Bruno Mars'],
  ["You've Got a Friend", 'Carole King'],
  ['We Are Family', 'Sister Sledge'],
  ['Home', 'Edward Sharpe and the Magnetic Zeros'],
  ['Dog Days Are Over', 'Florence and the Machine'],
  ['Youve Got the Love', 'Florence and the Machine'],
  ['What a Wonderful World', 'Louis Armstrong'],
  ['Three Little Birds', 'Bob Marley The Wailers'],
  ['Home', 'Phillip Phillips'],
  ['Stand by Me', 'Ben E. King']
];

function fileName(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '.jpg';
}

async function findArtwork(title, artist) {
  const query = encodeURIComponent(`${title} ${artist}`);
  const response = await fetch(`https://itunes.apple.com/search?term=${query}&media=music&entity=song&limit=1`);
  if (response.ok) {
    const data = await response.json();
    const track = data.results?.[0];
    if (track?.artworkUrl100) {
      return {
        source: 'song',
        artworkUrl: track.artworkUrl100.replace('100x100bb', '600x600bb'),
        albumArtworkUrl: track.collectionArtworkUrl100?.replace('100x100bb', '600x600bb') || null
      };
    }
  }

  const albumResponse = await fetch(`https://itunes.apple.com/search?term=${query}&media=music&entity=album&limit=1`);
  if (!albumResponse.ok) return null;
  const albumData = await albumResponse.json();
  const album = albumData.results?.[0];
  return album?.artworkUrl100 ? {
    source: 'album',
    artworkUrl: album.artworkUrl100.replace('100x100bb', '600x600bb'),
    albumArtworkUrl: album.artworkUrl100.replace('100x100bb', '600x600bb')
  } : null;
}

async function downloadCover(title, artist) {
  const destination = path.join(coversDirectory, fileName(title));
  if (fs.existsSync(destination)) return false;

  try {
    const artwork = await findArtwork(title, artist);
    const artworkUrl = artwork?.source === 'song'
      ? artwork.artworkUrl || artwork.albumArtworkUrl
      : artwork?.albumArtworkUrl;
    if (!artworkUrl) return false;
    const response = await fetch(artworkUrl);
    if (!response.ok) return false;
    fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
    console.log(`Music cover assistant saved ${fileName(title)}`);
    return true;
  } catch {
    return false;
  }
}

async function ensureMusicCovers() {
  fs.mkdirSync(coversDirectory, { recursive: true });
  for (const [title, artist] of tracks) {
    await downloadCover(title, artist);
  }
}

module.exports = { ensureMusicCovers };

if (require.main === module) {
  ensureMusicCovers().then(() => console.log('Cover refresh complete'));
}
