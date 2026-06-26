// web/app/page.tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";

// Dynamically select the backend URL based on environment variables
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Job = {
  id: string;
  job_title: string;
  company_name: string;
  location: string;
  job_url: string;
  experience_min: number;
  experience_max: number;
  experience_level: string;
  source: string;
};

type ResumeProfile = {
  skills: string[];
  suitable_job_titles: string[];
  keywords: string[];
  experience_years: number;
  summary: string;
};

type ResumeMatchResult = {
  profile: ResumeProfile;
  jobs: Job[];
};

export default function Home() {
  const { data: session } = useSession();

  // ── Normal browse state ───────────────────────────────────────────────────
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [minExp, setMinExp] = useState("-1");
  const [maxExp, setMaxExp] = useState("1");
  const [excludeCompany, setExcludeCompany] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  // ── Resume match state ────────────────────────────────────────────────────
  const [resumeProfile, setResumeProfile] = useState<ResumeProfile | null>(
    null,
  );
  const [resumeJobs, setResumeJobs] = useState<Job[]>([]);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const [resumeFileName, setResumeFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Saved jobs state ──────────────────────────────────────────────────────
  const [savedJobs, setSavedJobs] = useState<Set<string>>(new Set());

  // ── Computed: What to show in the feed ────────────────────────────────────
  const isResumeMode = resumeProfile !== null;
  const rawList = isResumeMode ? resumeJobs : jobs;
  const isLoading = isResumeMode ? resumeLoading : loading;

  // Apply client-side filters
  const displayedJobs = rawList.filter((job) => {
    const matchesSearch =
      search === "" ||
      job.job_title.toLowerCase().includes(search.toLowerCase());
    const matchesLocation =
      location === "" ||
      job.location.toLowerCase().includes(location.toLowerCase());
    const matchesExclude =
      excludeCompany === "" ||
      !job.company_name.toLowerCase().includes(excludeCompany.toLowerCase());
    const min = parseInt(minExp);
    const max = parseInt(maxExp);
    const matchesExp =
      min === -1 || (job.experience_min >= min && job.experience_max <= max);

    return matchesSearch && matchesLocation && matchesExclude && matchesExp;
  });

  // Sync saved job IDs
  useEffect(() => {
    if (!session?.user?.email) return;
    const fetchSavedIds = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/jobs/saved`, {
          headers: { "X-User-Email": session.user!.email! },
        });
        const data: Job[] = await res.json();
        if (data) setSavedJobs(new Set(data.map((j) => j.id)));
      } catch (err) {
        console.error("Failed to sync saved state:", err);
      }
    };
    fetchSavedIds();
  }, [session]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL(`${BACKEND_URL}/api/jobs`);
      const offset = (page - 1) * limit;
      url.searchParams.append("limit", limit.toString());
      url.searchParams.append("offset", offset.toString());
      if (search) url.searchParams.append("search", search);
      if (location) url.searchParams.append("location", location);
      if (minExp) url.searchParams.append("min_exp", minExp);
      if (maxExp) url.searchParams.append("max_exp", maxExp);
      if (excludeCompany)
        url.searchParams.append("exclude_company", excludeCompany);

      const res = await fetch(url.toString());
      const data = await res.json();
      setJobs(data || []);
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
    } finally {
      setLoading(false);
    }
  }, [page, search, location, minExp, maxExp, excludeCompany]);

  // FIX: Only re-run the fetch effect when the page changes or mode swaps,
  // preventing accidental API spam on every keystroke.
  useEffect(() => {
    if (!isResumeMode) fetchJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, isResumeMode]);

  const handleSearchClick = () => {
    if (isResumeMode) return; // Client-side filtering handles this automatically

    if (page === 1) {
      fetchJobs();
    } else {
      setPage(1); // Changing page to 1 automatically triggers the useEffect above
    }
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setResumeError("Only PDF files are supported.");
      return;
    }

    setResumeFileName(file.name);
    setResumeLoading(true);
    setResumeError("");
    setResumeProfile(null);
    setResumeJobs([]);

    const formData = new FormData();
    formData.append("resume", file);

    try {
      const res = await fetch(`${BACKEND_URL}/api/resume/match`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Server error");
      }

      const data: ResumeMatchResult = await res.json();
      setResumeProfile(data.profile);
      setResumeJobs(data.jobs || []);
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Failed to analyze resume.";
      setResumeError(msg);
      setResumeFileName("");
    } finally {
      setResumeLoading(false);
    }
  };

  const clearResume = () => {
    setResumeProfile(null);
    setResumeJobs([]);
    setResumeFileName("");
    setResumeError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleToggleSave = async (jobId: string) => {
    if (!session?.user?.email) return alert("Please sign in to save jobs.");

    const isSaved = savedJobs.has(jobId);
    const endpoint = isSaved ? "/api/jobs/unsave" : "/api/jobs/track";
    const body = isSaved
      ? { job_id: jobId }
      : { job_id: jobId, status: "Saved" };

    try {
      const res = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Email": session.user.email,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const updated = new Set(savedJobs);
        isSaved ? updated.delete(jobId) : updated.add(jobId);
        setSavedJobs(updated);
      }
    } catch (error) {
      console.error("Error updating saved status:", error);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-8 transition-colors">
      <div className="max-w-5xl mx-auto">
        {/* Header - Made Responsive */}
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-blue-600 dark:text-blue-400">
              SpearFish
            </h1>
            <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-2">
              Find your next role. Built for 0–2 years experience.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
            <ThemeToggle />
            {session && (
              <Link
                href="/saved"
                className="text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                View Saved Roles
              </Link>
            )}
            {session ? (
              <div className="flex items-center gap-3 bg-white dark:bg-gray-800 p-2 pr-4 rounded-full shadow-sm border border-gray-200 dark:border-gray-700">
                {session.user?.image && (
                  <img
                    src={session.user.image}
                    alt="Profile"
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-full"
                  />
                )}
                <div className="text-sm min-w-0">
                  <p className="font-medium text-gray-800 dark:text-gray-100 truncate max-w-[120px] sm:max-w-none">
                    {session.user?.name?.split(" ")[0]}
                  </p>
                  <button
                    onClick={() => signOut()}
                    className="text-red-500 hover:text-red-700 font-medium text-xs mt-0.5"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => signIn("google")}
                className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 px-5 sm:px-6 py-2 sm:py-2.5 rounded-full shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-sm sm:text-base font-medium transition-colors ml-auto md:ml-0"
              >
                Sign In
              </button>
            )}
          </div>
        </div>

        {/* ── Resume Match Section - Made Responsive ────────────────────────── */}
        <div className="mb-6">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleResumeUpload}
            className="hidden"
          />
          {!isResumeMode && !resumeLoading && (
            <div
              onClick={() => !resumeLoading && fileInputRef.current?.click()}
              className="cursor-pointer border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-5 flex flex-col sm:flex-row items-center justify-between gap-4 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors group text-center sm:text-left"
            >
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <span className="text-3xl sm:text-2xl mb-2 sm:mb-0">📄</span>
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    Match jobs to your resume
                  </p>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 sm:mt-0">
                    Upload a PDF — Gemini extracts your skills and reorders the
                    feed by relevance
                  </p>
                </div>
              </div>
              <span className="text-sm font-medium px-4 py-2 w-full sm:w-auto bg-blue-600 text-white rounded-lg group-hover:bg-blue-700 transition-colors shrink-0">
                Upload PDF
              </span>
            </div>
          )}
          {resumeLoading && (
            <div className="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-5 flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4">
              <div className="w-6 h-6 sm:w-5 sm:h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
              <div>
                <p className="font-medium text-blue-800 dark:text-blue-300">
                  Analyzing {resumeFileName}...
                </p>
                <p className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 mt-1 sm:mt-0">
                  Gemini is reading your resume and matching skills to jobs
                </p>
              </div>
            </div>
          )}
          {resumeError && !resumeLoading && (
            <div className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <p className="text-sm text-red-700 dark:text-red-300">
                ⚠ {resumeError}
              </p>
              <button
                onClick={() => {
                  setResumeError("");
                  fileInputRef.current?.click();
                }}
                className="text-sm font-medium text-red-600 dark:text-red-400 hover:underline shrink-0"
              >
                Try again
              </button>
            </div>
          )}
          {isResumeMode && !resumeLoading && (
            <div className="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-lg p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3">
                  <span className="text-green-600 dark:text-green-400 font-bold text-xl mt-0.5 sm:mt-0">
                    ✓
                  </span>
                  <div>
                    <p className="font-semibold text-green-800 dark:text-green-300">
                      Resume active
                    </p>
                    <p className="text-xs sm:text-sm text-green-700 dark:text-green-400 mt-1 sm:mt-0.5 leading-relaxed">
                      {resumeProfile.summary}
                    </p>
                  </div>
                </div>
                <button
                  onClick={clearResume}
                  className="shrink-0 w-full sm:w-auto text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 border border-gray-300 dark:border-gray-600 px-3 py-2 sm:py-1.5 rounded-md transition-colors"
                >
                  ✕ Clear
                </button>
              </div>
              {/* Profile Chips */}
              <div className="space-y-3">
                {resumeProfile.suitable_job_titles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs font-medium text-green-700 dark:text-green-400 mr-1 w-full sm:w-auto mb-1 sm:mb-0">
                      Target roles:
                    </span>
                    {resumeProfile.suitable_job_titles.map((title) => (
                      <span
                        key={title}
                        className="text-xs px-2.5 py-1 bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 rounded-full border border-green-200 dark:border-green-700 font-medium"
                      >
                        {title}
                      </span>
                    ))}
                  </div>
                )}
                {resumeProfile.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs font-medium text-green-700 dark:text-green-400 mr-1 w-full sm:w-auto mb-1 sm:mb-0">
                      Skills:
                    </span>
                    {resumeProfile.skills.slice(0, 10).map((skill) => (
                      <span
                        key={skill}
                        className="text-xs px-2.5 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full border border-green-200 dark:border-green-700"
                      >
                        {skill}
                      </span>
                    ))}
                    {resumeProfile.skills.length > 10 && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        +{resumeProfile.skills.length - 10} more
                      </span>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-green-600 dark:text-green-500 pt-2 border-t border-green-200 dark:border-green-800/50">
                Showing {resumeJobs.length} jobs ranked by relevance to your
                profile.{" "}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="underline hover:text-green-800 dark:hover:text-green-300 font-medium ml-1"
                >
                  Upload different resume
                </button>
              </p>
            </div>
          )}
        </div>

        {/* ── Responsive Search Controls Grid ───────────────────────────────── */}
        <div className="mb-8 bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 sm:gap-4 items-end">
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Role / Keywords
            </label>
            <input
              type="text"
              placeholder="Job title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchClick()}
              className="w-full border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-2 sm:p-2.5 rounded text-sm sm:text-base"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Location
            </label>
            <input
              type="text"
              placeholder="Location..."
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchClick()}
              className="w-full border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-2 sm:p-2.5 rounded text-sm sm:text-base"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Exclude Term
            </label>
            <input
              type="text"
              placeholder="e.g. PwC"
              value={excludeCompany}
              onChange={(e) => setExcludeCompany(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchClick()}
              className="w-full border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-2 sm:p-2.5 rounded text-sm sm:text-base"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Experience (Yrs)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={minExp}
                onChange={(e) => setMinExp(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchClick()}
                className="w-full border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-2 sm:p-2.5 rounded text-center text-sm sm:text-base"
              />
              <span className="text-gray-400 shrink-0 text-sm">to</span>
              <input
                type="number"
                value={maxExp}
                onChange={(e) => setMaxExp(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchClick()}
                className="w-full border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-2 sm:p-2.5 rounded text-center text-sm sm:text-base"
              />
            </div>
          </div>
          <div className="md:col-span-2 sm:col-span-2 pt-2 sm:pt-0">
            <button
              onClick={handleSearchClick}
              className="w-full bg-blue-600 text-white px-4 py-2 sm:py-2.5 rounded hover:bg-blue-700 font-medium transition-colors shadow-sm text-sm sm:text-base h-[40px] sm:h-[44px]"
            >
              Search
            </button>
          </div>
        </div>

        {/* ── Job feed ──────────────────────────────────────────────────────────── */}
        <div className="grid gap-4 mb-8">
          {isLoading ? (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
              <p>
                {isResumeMode
                  ? "Matching jobs to your resume..."
                  : "Fetching jobs..."}
              </p>
            </div>
          ) : displayedJobs.length === 0 ? (
            <div className="text-center py-16 px-4 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <span className="text-4xl mb-3 block">🎣</span>
              <p className="font-medium text-lg text-gray-700 dark:text-gray-300">
                No jobs found
              </p>
              <p className="mt-1 text-sm">
                {isResumeMode
                  ? "No jobs matched your resume. Try adjusting filters or uploading a different version."
                  : "Try adjusting your filters or searching for something else."}
              </p>
            </div>
          ) : (
            displayedJobs.map((job) => (
              <div
                key={job.id}
                className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all group"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start gap-2 sm:gap-4">
                  <div className="min-w-0 w-full sm:w-auto">
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {job.job_title}
                    </h2>
                    <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 mt-0.5">
                      {job.company_name}
                    </p>
                  </div>
                  <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 shrink-0 w-full sm:w-auto">
                    <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-xs font-medium px-2.5 py-1 rounded-md border border-green-200 dark:border-green-800/50">
                      {job.experience_min === -1
                        ? "Unknown exp"
                        : `${job.experience_min}–${job.experience_max} yrs`}
                    </span>
                    {job.experience_level !== "Unknown" && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {job.experience_level}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 sm:mt-5 pt-4 sm:pt-0 sm:border-t-0 border-t border-gray-100 dark:border-gray-700/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <p className="text-gray-500 dark:text-gray-400 text-sm truncate max-w-full sm:max-w-sm flex items-center gap-1.5">
                    <span className="shrink-0">📍</span>
                    <span className="truncate">
                      {job.location || "Location not specified"}
                    </span>
                  </p>

                  <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 justify-between sm:justify-end">
                    <button
                      onClick={() => handleToggleSave(job.id)}
                      className={`text-sm font-medium px-4 py-2 rounded-md transition-colors w-1/2 sm:w-auto text-center ${
                        savedJobs.has(job.id)
                          ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-transparent"
                          : "bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600"
                      }`}
                    >
                      {savedJobs.has(job.id) ? "✕ Unsave" : "🔖 Save Role"}
                    </button>
                    <a
                      href={job.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white bg-blue-600 hover:bg-blue-700 text-sm font-medium px-5 py-2 rounded-md transition-colors w-1/2 sm:w-auto text-center shadow-sm"
                    >
                      Apply ↗
                    </a>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Pagination (normal mode only) ─────────────────────────────────────── */}
        {!isResumeMode && !isLoading && displayedJobs.length > 0 && (
          <div className="flex justify-center items-center space-x-2 sm:space-x-4 pt-6 sm:pt-4 border-t border-gray-200 dark:border-gray-800 pb-8">
            <button
              onClick={() => {
                setPage((p) => Math.max(p - 1, 1));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              disabled={page === 1}
              className="px-4 sm:px-5 py-2 sm:py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium shadow-sm"
            >
              ← <span className="hidden sm:inline">Previous</span>
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium px-2">
              Page {page}
            </span>
            <button
              onClick={() => {
                setPage((p) => p + 1);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              disabled={displayedJobs.length < limit}
              className="px-4 sm:px-5 py-2 sm:py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium shadow-sm"
            >
              <span className="hidden sm:inline">Next</span> →
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
