# ConnectAR

ConnectAR is a web-based platform for turning **real-world objects into shareable Gaussian Splat 3D assets** and experiencing them in AR.

Users capture or upload images, generate a .sog 3D object, store it in a personal gallery, keep it private or publish it, buy and gift objects between users, and place owned objects into marker-based AR scenes.

## Core Features

* Mobile camera capture and image upload
* Gaussian Splat generation with ML-Sharp and FreeSplatter
* Persistent personal 3D gallery
* PUBLIC and EXCLUSIVE objects
* Coin-based user marketplace
* Direct object gifting between users
* Multi-object marker-based AR
* Admin dashboard for users, coins, objects, and statistics

## Architecture

Flask Web Frontend
        │
        │ REST API + JWT
        ▼
NestJS Backend
Prisma · PostgreSQL
        │
        │ Images
        ▼
Python Generation Gateway
   ├── ML-Sharp
   └── FreeSplatter
        │
        ▼
   PLY → SOG
        │
        ▼
Gallery · Marketplace · AR

## Tech Stack

Layer	Technologies
Frontend	Flask, Jinja, JavaScript, CSS
AR & 3D	MindAR, Three.js, Spark
Backend	NestJS, TypeScript, Prisma, PostgreSQL
Generation	ML-Sharp, FreeSplatter, BiRefNet
Auth	JWT + server-side session validation
