import React from "react";
import { render, screen } from "@testing-library/react";
import { AutoFitText } from "./AutoFitText";

describe("AutoFitText", () => {
  let originalResizeObserver: typeof globalThis.ResizeObserver;

  beforeAll(() => {
    // Mock do ResizeObserver
    originalResizeObserver = global.ResizeObserver;
    global.ResizeObserver = class ResizeObserver {
      callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        // Simula o disparo de um resize
        // A propriedade scrollHeight não é facilmente mockada no JSDOM
        // mas podemos testar se o observer é anexado e se ele tenta atualizar as variáveis CSS.
        this.callback(
          [
            {
              target,
              contentRect: { width: 100, height: 100, top: 0, bottom: 0, left: 0, right: 0, x: 0, y: 0, toJSON: () => "" },
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            },
          ],
          this
        );
      }
      unobserve() {}
      disconnect() {}
    };
  });

  afterAll(() => {
    global.ResizeObserver = originalResizeObserver;
  });

  it("renderiza o conteúdo (children)", () => {
    render(
      <AutoFitText maxHeight={100}>
        <div data-testid="content">Texto Grande</div>
      </AutoFitText>
    );

    expect(screen.getByTestId("content")).toBeInTheDocument();
    expect(screen.getByText("Texto Grande")).toBeInTheDocument();
  });

  it("aplica estilos base no container", () => {
    const { container } = render(
      <AutoFitText maxHeight={200} className="custom-class" style={{ marginTop: 10 }}>
        <div>Conteúdo</div>
      </AutoFitText>
    );

    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv.className).toContain("custom-class");
    expect(outerDiv.style.marginTop).toBe("10px");
    
    // O estilo interno essencial
    const innerDiv = outerDiv.firstChild as HTMLElement;
    expect(innerDiv.style.display).toBe("block");
  });
});
