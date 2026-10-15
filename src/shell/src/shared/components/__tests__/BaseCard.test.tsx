import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BaseCard } from "../BaseCard";
import { makeLibraryEntry } from "../../../test/factories";

function DummyIcon() {
  return <span aria-hidden="true">Lab icon</span>;
}

describe("BaseCard", () => {
  it.each(["list", "grid", "compact"] as const)(
    "renders the %s view",
    (viewMode) => {
      render(
        <BaseCard
          item={makeLibraryEntry()}
          viewMode={viewMode}
          isSelected={false}
          icon={DummyIcon}
        />,
      );

      expect(screen.getByTestId("base-library-card")).toHaveClass(`view-${viewMode}`);
    },
  );

  it("composes the entry identity, owner, status, tags, and supplied icon", () => {
    render(
      <BaseCard
        item={makeLibraryEntry({
          display_id: "EXP-0284",
          title: "gRNA screen v3",
          author_username: "m.kato",
          author_info: {
            id: 1,
            username: "m.kato",
            first_name: "Mira",
            last_name: "Kato",
            color: "#4A90D9",
          },
          status: "in_progress",
          tags: [{ id: 1, name: "CRISPR", color: "flask", icon: "circle" }],
        })}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        showTags
      />,
    );

    expect(screen.getByText("EXP-0284")).toBeInTheDocument();
    expect(screen.getByText("gRNA screen v3")).toBeInTheDocument();
    expect(screen.getByText("m.kato")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("CRISPR")).toBeInTheDocument();
    expect(screen.getByText("Lab icon")).toBeInTheDocument();
  });

  it("shows configured metadata and omits it when the corresponding options are disabled", () => {
    const item = makeLibraryEntry({
      description: "First paragraph of content",
      tags: [{ id: 1, name: "CRISPR", color: "flask", icon: "circle" }],
      updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      property_fields: { samples_count: 5, attachments_count: 3 },
    });
    const props = {
      item,
      viewMode: "list" as const,
      isSelected: false,
      icon: DummyIcon,
    };
    const { rerender } = render(
      <BaseCard
        {...props}
        showDescription
        showTags
        showUpdatedAt
        propertyFields={[
          { key: "samples_count", label: "Samples" },
          { key: "attachments_count", label: "Attachments" },
        ]}
      />,
    );

    expect(screen.getByText("First paragraph of content")).toBeInTheDocument();
    expect(screen.getByText("CRISPR")).toBeInTheDocument();
    expect(screen.getByTestId("updated-at")).toBeInTheDocument();
    expect(screen.getByTestId("property-fields")).toHaveTextContent("5");
    expect(screen.getByTestId("property-fields")).toHaveTextContent("3");

    rerender(
      <BaseCard
        {...props}
        item={{ ...item, property_fields: { samples_count: null, attachments_count: null } }}
        propertyFields={[
          { key: "samples_count", label: "Samples" },
          { key: "attachments_count", label: "Attachments" },
        ]}
      />,
    );
    expect(screen.getByTestId("property-fields").textContent).toBe("— · —");

    rerender(<BaseCard {...props} showDescription={false} showTags={false} showUpdatedAt={false} />);
    expect(screen.queryByText("First paragraph of content")).not.toBeInTheDocument();
    expect(screen.queryByText("CRISPR")).not.toBeInTheDocument();
    expect(screen.queryByTestId("updated-at")).not.toBeInTheDocument();
  });

  it("keeps selection state visible and sends card activation to its caller", () => {
    const onClick = vi.fn();
    render(
      <BaseCard
        item={makeLibraryEntry()}
        viewMode="grid"
        isSelected
        icon={DummyIcon}
        onClick={onClick}
      />,
    );
    const card = screen.getByTestId("base-library-card");

    expect(card).toHaveClass("is-selected");
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("uses the description fallback and omits an absent owner", () => {
    render(
      <BaseCard
        item={makeLibraryEntry({ description: "", author_username: null, author_info: null })}
        viewMode="list"
        isSelected={false}
        icon={DummyIcon}
        showDescription
      />,
    );

    expect(screen.getByText("No description")).toBeInTheDocument();
    expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
  });
});
