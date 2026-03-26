<div align="center">

# 🍉 Fruit Ninja Interactivo

**Corta fruta con tus manos — sin mandos, sin teclado, sin trucos.**

Detección de poses en tiempo real directamente en el navegador.

[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)](https://vitejs.dev)
[![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-MoveNet-ff6f00?logo=tensorflow&logoColor=white)](https://www.tensorflow.org/js)

</div>

---

## ¿Cómo funciona?

La cámara captura tu imagen en tiempo real. Cada frame pasa por **MoveNet Lightning**, un modelo de Google que detecta 17 puntos clave del cuerpo humano. A partir del codo y la muñeca, se extrapola la posición del centro de la mano. Cuando esa posición cruza una fruta a suficiente velocidad, se produce el corte.

```
Cámara → MoveNet (17 keypoints) → extrapolar centro de mano → colisión → ¡slice!
```

Todo corre **100% en el navegador**, sin servidores, sin enviar vídeo a ningún sitio. La inferencia ocurre en la GPU local mediante WebGL.

---

## Gameplay

<div align="center">

| Elemento | Acción | Efecto |
|----------|--------|--------|
| 🍎 🍊 🍋 🍇 🍉 🍓 🍑 🍍 🥭 🍌 | Cortar | +1 punto (o más con combo) |
| 💣 | Tocar | −1 vida + flash rojo |
| ❤️❤️❤️ | Perder una fruta | −1 vida |
| ⚡ COMBO | Cortar varias seguidas | Puntos × número de combo |

</div>

- **Mano izquierda** → rastro cyan `#00eeff`
- **Mano derecha** → rastro magenta `#ff00cc`
- Las frutas se **parten en dos mitades** al cortarlas, con partículas de zumo del color de cada fruta
- La pantalla hace **flash rojo** cuando pierdes una vida

---

## Instalación

```bash
git clone https://github.com/Asier-Comba/FruitNinjaInteractivo.git
cd FruitNinjaInteractivo
npm install
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173), acepta el permiso de cámara y empieza a cortar.

> Colócate con buena iluminación y deja espacio para mover los brazos.

---

## Arquitectura

El estado del juego vive completamente en una `ref` para evitar re-renders en cada frame. `setState` solo se llama cuando cambian score o vidas — el resto lo maneja el canvas directamente.

```
App.jsx
 ├── loadDetector()     carga MoveNet lazy (solo la primera vez)
 ├── makeGame()         estado inicial: frutas, vidas, trails, partículas...
 ├── loop()             requestAnimationFrame → pose → update → draw
 ├── update()
 │    ├── spawnFruit()         física y spawn progresivo
 │    ├── segmentCircle()      intersección segmento-círculo para detectar cortes
 │    ├── spawnHalves()        mitades de fruta con física independiente
 │    └── spawnParticles()     partículas de zumo por color de fruta
 └── draw()
      ├── canvas clip trick    dibuja mitades superiores/inferiores de la fruta
      ├── shadowBlur           glow neon en rastros y partículas
      └── HUD                  vidas, score, combo pulsante
```

### Estimación del centro de la mano

MoveNet no detecta dedos. El centro de la mano se extrapola a partir de la posición del codo y la muñeca:

```js
// codo → muñeca, extender un 35% más allá
hand_x = wrist_x + (wrist_x - elbow_x) * 0.35
hand_y = wrist_y + (wrist_y - elbow_y) * 0.35
```

Si el codo no tiene suficiente confianza, se usa la muñeca directamente como fallback.

---

## Posibles mejoras

- [ ] High scores con `localStorage`
- [ ] Efectos de sonido (corte, explosión, combo)
- [ ] Modo zen sin bombas
- [ ] Dificultad adaptativa más agresiva
- [ ] Soporte móvil con cámara trasera
- [ ] Multijugador (dos jugadores en pantalla partida)
