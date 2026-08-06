import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { PickerPortal } from "../PickerPortal";

function TestPanelRef() {
  const ref = useRef<HTMLDivElement | null>(null);
  return { ref };
}

describe("PickerPortal", () => {
  it("renders null when position is null", () => {
    const { result } = renderHook(() => TestPanelRef());
    const { ref } = result;

    const { container } = render(
      <PickerPortal
        position={null}
        panelRef={ref}
        testId="test-picker"
      >
        <span>content</span>
      </PickerPortal>,
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders children into document.body", () => {
    const { result } = renderHook(() => TestPanelRef());
    const { ref } = result;

    render(
      <PickerPortal
        position={{ top: 100, left: 200 }}
        panelRef={ref}
        testId="test-picker"
      >
        <span>Hello World</span>
      </PickerPortal>,
    );

    expect(screen.getByTestId("test-picker")).toBeInTheDocument();
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("applies fixed positioning with given coordinates", () => {
    const { result } = renderHook(() => TestPanelRef());
    const { ref } = result;

    render(
      <PickerPortal
        position={{ top: 150, left: 300 }}
        panelRef={ref}
        testId="positioned-picker"
      >
        <span>positioned</span>
      </PickerPortal>,
    );

    const el = screen.getByTestId("positioned-picker");
    expect(el.style.position).toBe("fixed");
    expect(el.style.top).toBe("150px");
    expect(el.style.left).toBe("300px");
  });

  it("applies popover chrome classes", () => {
    const { result } = renderHook(() => TestPanelRef());
    const { ref } = result;

    render(
      <PickerPortal
        position={{ top: 0, left: 0 }}
        panelRef={ref}
        testId="chrome-picker"
      >
        <span>chrome</span>
      </PickerPortal>,
    );

    const el = screen.getByTestId("chrome-picker");
    expect(el.className).toContain("z-50");
    expect(el.className).toContain("rounded-md");
    expect(el.className).toContain("border-hairline");
    expect(el.className).toContain("bg-popover");
    expect(el.className).toContain("shadow-lg");
  });

  it("attaches panelRef to the rendered div", () => {
    const { result } = renderHook(() => TestPanelRef());
    const { ref } = result;

    render(
      <PickerPortal
        position={{ top: 0, left: 0 }}
        panelRef={ref}
        testId="ref-picker"
      >
        <span>ref test</span>
      </PickerPortal>,
    );

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute("data-testid")).toBe("ref-picker");
  });
});

function renderHook<T>(setup: () => T) {
  let result!: T;
  function TestComponent() {
    result = setup();
    return null;
  }
  render(<TestComponent />);
  return { result };
}
