![](https://i.imgur.com/L7moBQT.png)

# Part Designer

This is a free online CAD tool to create custom LEGO® Technic compatible construction parts for 3D printing.

Features
- Assemble a custom part from basic blocks: Pin Hole, Axle Hole, Pin, Axle, Solid
- Save your model as an STL file
- Catalog of existing LEGO® parts
- Customize measurements to get a perfect fit
- Create a sharable link of your part

# Local setup and development

Prereqs: Node.js 18+ and npm.

- Install dependencies: `npm install`.
- Start development (TypeScript watch + Vite static server): `npm run dev`, then open http://localhost:5173.
- One-off build: `npm run build` (emits `app.js` and `app.js.map` in the project root).
- Type-check only without the dev server: `npm run typecheck`.
- Refresh catalog from browser bookmark exports in `data/`: `npm run generate-catalog` (writes `src/editor/catalogData.ts`).
