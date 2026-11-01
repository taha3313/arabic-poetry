import { useCallback, useEffect, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string };

export function AutoGrowingTextarea(props: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight + element.offsetHeight - element.clientHeight}px`;
  }, []);

  useLayoutEffect(resize, [props.value, resize]);
  useEffect(() => {
    const element = ref.current;
    const container = element?.parentElement;
    if (!element || !container) return;
    let active = true;
    let lastSignature = "";
    const observer = new ResizeObserver(() => {
      const style = getComputedStyle(element);
      const signature = `${element.clientWidth}/${style.fontSize}/${style.lineHeight}/${style.fontFamily}`;
      if (signature !== lastSignature) {
        lastSignature = signature;
        resize();
      }
    });
    observer.observe(container);
    window.addEventListener("resize", resize);
    document.fonts.ready.then(() => { if (active) resize(); });
    return () => {
      active = false;
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [resize]);

  return <textarea {...props} ref={ref} />;
}
