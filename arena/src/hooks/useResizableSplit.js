import { useState, useCallback, useEffect, useRef } from "react";

/**
 * Custom hook to handle resizable split layout logic using Pointer Events.
 * 
 * @param {Object} options
 * @param {string} options.id Unique ID for the layout group (localStorage key).
 * @param {number} options.defaultRatio Default ratio (0-100) if no value is stored.
 * @param {string} options.direction "horizontal" | "vertical"
 * @param {number} options.minPixels A minimum pixel value for both panels.
 * @param {boolean} options.disabled If true, resizing is disabled (e.g. on mobile).
 * @returns {Object} { ratio, isDragging, handleProps, containerRef }
 */
export function useResizableSplit({ 
  id, 
  defaultRatio = 50, 
  direction = "horizontal", 
  minPixels = 300, 
  disabled = false 
}) {
  const STORAGE_KEY = `splitRatio:${id}`;
  const containerRef = useRef(null);
  
  // Load initial value from localStorage or use default
  const [ratio, setRatio] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? parseFloat(stored) : defaultRatio;
    } catch {
      return defaultRatio;
    }
  });

  const [isDragging, setIsDragging] = useState(false);

  const startDragging = useCallback((e) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
  }, [disabled]);

  useEffect(() => {
    if (!isDragging || disabled) return;

    const onPointerMove = (e) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      let newRatio;

      if (direction === "horizontal") {
        const clientX = e.clientX;
        const relativeX = clientX - rect.left;
        newRatio = (relativeX / rect.width) * 100;
        
        // Enforce min pixel constraints (300px min for left, 400px min for right as per request)
        const leftMin = (minPixels / rect.width) * 100;
        const rightMin = ((rect.width - 400) / rect.width) * 100;
        
        newRatio = Math.max(leftMin, Math.min(rightMin, newRatio));
      } else {
        const clientY = e.clientY;
        const relativeY = clientY - rect.top;
        newRatio = (relativeY / rect.height) * 100;

        // Enforce min pixel constraints
        const topMin = (minPixels / rect.height) * 100;
        const bottomMin = ((rect.height - 300) / rect.height) * 100;

        newRatio = Math.max(topMin, Math.min(bottomMin, newRatio));
      }

      setRatio(newRatio);
    };

    const stopDragging = () => {
      setIsDragging(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [isDragging, direction, minPixels, disabled]);

  // Persist ratio on change (or on debounced change)
  useEffect(() => {
    if (disabled) return;
    try {
      localStorage.setItem(STORAGE_KEY, ratio.toString());
    } catch {}
  }, [ratio, STORAGE_KEY, disabled]);

  return {
    ratio,
    isDragging,
    containerRef,
    handleProps: {
      onPointerDown: startDragging,
      style: { 
        cursor: disabled ? "default" : (direction === "horizontal" ? "col-resize" : "row-resize"),
        touchAction: "none"
      }
    }
  };
}
