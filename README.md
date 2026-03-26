# 🍉 Fruit Ninja Interactivo

> Corta fruta con tus manos usando detección de poses en tiempo real — sin mandos, sin teclado, sin trucos.

![Demo](https://img.shields.io/badge/estado-en%20desarrollo-brightgreen) ![Tech](https://img.shields.io/badge/tech-MoveNet%20%7C%20React%20%7C%20Vite-blue)

---

## ¿Cómo funciona?

La cámara detecta la posición de tus muñecas en cada frame usando **MoveNet Lightning** (un modelo de detección de poses de Google que corre 100% en el navegador, sin servidores). Cuando tu mano se mueve rápido y cruza una fruta, ¡la cortas!

```
Cámara → MoveNet → posición muñecas → detección de colisión → ¡slice!
```

---

## Gameplay

| Elemento | Descripción |
|----------|-------------|
| 🍎 🍊 🍋 🍇 🍉 | Frutas — córtalas para sumar puntos |
| 💣 | Bomba — si la tocas pierdes una vida |
| ❤️ | Tienes 3 vidas. Se te escapa una fruta → pierdes una |
| ⚡ COMBO | Cortar varias frutas seguidas multiplica los puntos |

**Mano izquierda** → rastro azul `#00eeff`
**Mano derecha** → rastro rosa `#ff00cc`

---

## Tecnologías

- **[MoveNet Lightning](https://www.tensorflow.org/hub/tutorials/movenet)** — detección de 17 keypoints corporales a alta velocidad
- **TensorFlow.js** + **WebGL backend** — inferencia en GPU directamente en el navegador
- **React 18** — gestión de estado y ciclo de vida
- **Vite 5** — bundler y dev server
- **Canvas API** — renderizado del juego: vídeo espejado, frutas, rastros, partículas y HUD

---

## Instalación y uso

```bash
# Clonar el repo
git clone https://github.com/Asier-Comba/FruitNinjaInteractivo.git
cd FruitNinjaInteractivo

# Instalar dependencias
npm install

# Arrancar en local
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173), acepta el permiso de cámara y empieza a cortar.

> **Recomendado:** colócate con buena iluminación y deja espacio para mover los brazos.

---

## Arquitectura del juego

```
App.jsx
 ├── loadDetector()       → carga MoveNet de forma lazy (solo la primera vez)
 ├── makeGame()           → inicializa el estado del juego (frutas, vidas, score...)
 ├── loop()               → requestAnimationFrame → pose detection → update → draw
 ├── update()             → física, spawn, detección de cortes, partículas
 │    └── segmentCircle() → geometría: comprueba si el trazo de la mano cruza una fruta
 └── draw()               → Canvas: vídeo espejado + rastros + frutas + HUD
```

El estado del juego vive en una `ref` (`gameRef`) para evitar re-renders en cada frame. Solo se llama a `setState` cuando cambian score o vidas.

---

## Ideas para seguir mejorando

- [ ] Pantalla de high scores (localStorage)
- [ ] Modo zen sin bombas
- [ ] Efectos de sonido
- [ ] Dificultad adaptativa más agresiva
- [ ] Soporte móvil con cámara trasera
