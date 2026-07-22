import { ProfileHeader } from "../components/ProfileHeader";
import { StatsBar } from "../components/StatsBar";
import { AboutSection } from "../components/AboutSection";
import { NotebookActivity } from "../components/NotebookActivity";
import { RecentActivity } from "../components/RecentActivity";
import { AffiliationsSection } from "../components/AffiliationsSection";
import { PublicationsSection } from "../components/PublicationsSection";
import { ProjectsSection } from "../components/ProjectsSection";
import { RecognitionsSection } from "../components/RecognitionsSection";
import { AvailabilitySection } from "../components/AvailabilitySection";

/**
 * ProfilePage — the user's own profile.
 *
 * Layout:
 *  1. Full-width ProfileHeader (avatar, name, position, affiliation, metadata)
 *  2. Full-width StatsBar (4 placeholder stat cards)
 *  3. Two-column scrollable content area below:
 *     - Left column:  About, Notebook Activity, Recent Activity
 *     - Right column: Publications, Affiliations, Projects, Recognitions, Availability
 */
export default function ProfilePage() {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <ProfileHeader />
      <StatsBar />

      {/* Two-column content grid */}
      <section className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-[70%_30%]">
          {/* ── Left column ─────────────────────────────────── */}
          <div className="flex flex-col gap-6">
            <AboutSection />
            <NotebookActivity />
            <RecentActivity />
          </div>

          {/* ── Right column ────────────────────────────────── */}
          <div className="flex flex-col gap-6">
            <PublicationsSection />
            <AffiliationsSection />
            <ProjectsSection />
            <RecognitionsSection />
            <AvailabilitySection />
          </div>
        </div>
      </section>
    </div>
  );
}
