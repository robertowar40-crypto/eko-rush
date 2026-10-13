# Eko Rush

A 3D endless runner set on the streets of Lagos, Nigeria, built with plain HTML, CSS, JavaScript and [Three.js](https://threejs.org/). Dodge danfos, BRT buses and kekes, grab a jetpack and fly over traffic, and race a friend on the same course. All of this runs in the browser with nothing to install.

**Play it now: [robertowar40-crypto.github.io/eko-rush](https://robertowar40-crypto.github.io/eko-rush/)**

## Features

- **Lagos landmarks:** run past the National Theatre, NECOM House, the Civic Centre, Tafawa Balewa Square, the Lekki–Ikoyi Link Bridge, Third Mainland Bridge and Eko Atlantic.
- **Three runners:** Tunde from Yaba, Amaka from Lekki and Seun from Surulere. Run too clumsily and the LASTMA officer chasing you will catch up.
- **Power-ups:** coin magnet, super sneakers (higher jumps), double score and an 8-second **jetpack** with a trail of coins in the sky.
- **Dynamic running:** speed builds up over the run. The camera widens and tilts with your speed, speed lines appear, dust kicks up, and switching lanes just past a vehicle earns a close-call bonus.
- **Race a friend (PvP):** create a match, share the link or 6-character code, and race on an identical course. Your friend appears as a ghost runner, and the higher score wins.
- **Light and dark themes** with Airbnb red (`#FF385C`) as the main colour. In dark mode the city switches to night: street lamps glow and windows light up.
- **Interactive landing page:** a 3D model you can drag around follows your cursor, plus a landmark explorer and a runner picker.
- **Responsive:** keyboard controls on desktop, swipe controls on phones and tablets.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Change lane | Left / Right arrow (or A / D) | Swipe left / right |
| Jump | Up arrow, W or Space | Swipe up |
| Roll | Down arrow or S | Swipe down |
| Pause | P or Esc | Pause button |
| Mute | M | Sound button |

## Running it locally

The game is a static site, so any local web server works. From the project folder:

```bash
# Python
python -m http.server 5500

# or Node
npx serve .
```

Then open [http://localhost:5500](http://localhost:5500) for the landing page or [http://localhost:5500/game.html](http://localhost:5500/game.html) to jump straight into the game.

You can also open `index.html` directly from disk, although a local server is recommended.

## Playing against a friend

1. Open the game, choose **Vs a friend** and click **Create match & get link**.
2. Send your friend the link or the 6-character code.
3. When they join, the host presses **Start race**.

Players connect directly through WebRTC, using the free [PeerJS](https://peerjs.com/) cloud service to find each other, so both computers need an internet connection. On the [hosted version](https://robertowar40-crypto.github.io/eko-rush/), the shared link opens straight into your match. A `localhost` link only works on your own computer, so if you're running it locally, your friend needs their own copy and has to type in your code.

## Project structure

```
index.html        Landing page
game.html         Game page (menu, HUD, overlays)
css/styles.css    Landing page styles
css/game.css      Game styles
js/theme.js       Light/dark theme switching
js/models.js      Procedural 3D models (vehicles, runners, landmarks, buildings)
js/landing.js     Landing page 3D scenes and interactions
js/game.js        Game engine (movement, spawning, collisions, effects, audio)
js/pvp.js         Peer-to-peer multiplayer
```

Every model is built in code from basic shapes and canvas textures, so there are no external 3D files to load.

## Built with

- [Three.js r149](https://threejs.org/)
- [PeerJS](https://peerjs.com/) for multiplayer
- Web Audio API for sound effects and the afrobeats loop
- [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans)
