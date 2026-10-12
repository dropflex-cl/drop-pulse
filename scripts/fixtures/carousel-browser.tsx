import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CarouselLibrary } from "../../components/screens/ads-carousel";
import { carouselFixture } from "../../lib/ads/carousel-fixtures";
import type { AdMedia } from "../../lib/types";
const content = carouselFixture();
const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#12334e"/><text x="40" y="120" fill="white" font-size="45">Cuidado para tu mirada</text><rect x="280" y="360" width="210" height="450" rx="30" fill="#378bc0"/></svg>')}`;
const sample: AdMedia = { id: "00000000-0000-4000-8000-000000000004", kind: "carousel", name: "Carrusel Sadoer", url: image, ratio: "4:5", angleSlot: null, format: null, durationS: null, status: "ready", error: null,
  carousel: { id: "00000000-0000-4000-8000-000000000004", content, etag: "a".repeat(64), ready: true, problem: null, cards: content.cards.map(c => ({ ...c, storage_path: "test.jpg", width: 800, height: 1000, size_bytes: 100, problem: null, url: image })) } };
function App() { const [media, setMedia] = useState([sample]), [selected, setSelected] = useState<string[]>([]); return <main className="mx-auto max-w-content p-4"><h1 className="mb-4 text-display">Anuncios</h1><CarouselLibrary productId="00000000-0000-4000-8000-000000000001" media={media} selected={selected} onMedia={m => setMedia(list => list.map(v => v.id === m.id ? m : v))} onChoose={id => setSelected(s => s.includes(id) ? [] : [id])} /></main>; }
createRoot(document.getElementById("root")!).render(<App />);
