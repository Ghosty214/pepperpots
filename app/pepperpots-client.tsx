'use client';

import { useEffect, useRef } from 'react';
import { mountPepperpots } from '../app.js';
import '../styles.css';

export default function PepperpotsClient() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    return mountPepperpots(rootRef.current);
  }, []);

  return <div ref={rootRef} />;
}
