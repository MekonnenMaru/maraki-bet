"use client";

import { useEffect, useState } from "react";

const SLIDES = [
  { src: "/banners/welcome.svg", alt: "Welcome to MarakiBET.com" },
  { src: "/banners/live.svg", alt: "Live betting" },
  { src: "/banners/bonus.svg", alt: "6-leg accumulator bonus" },
];

export function BannerBox() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((value) => (value + 1) % SLIDES.length);
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="banner-box">
      <div className="banner-track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {SLIDES.map((slide) => (
          <figure key={slide.src} className="banner-slide">
            <img src={slide.src} alt={slide.alt} />
          </figure>
        ))}
      </div>
      <div className="banner-dots">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.src}
            type="button"
            className={i === index ? "on" : undefined}
            aria-label={`Show banner ${i + 1}`}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </div>
  );
}
