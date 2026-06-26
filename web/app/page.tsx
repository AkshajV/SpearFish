// web/app/page.tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";

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

  // Apply client-side filters to the active list
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
        const res = await fetch("http://localhost:8080/api/jobs/saved", {
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
      const url = new URL("http://localhost:8080/api/jobs");
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

  useEffect(() => {
    if (!isResumeMode) fetchJobs();
  }, [page, fetchJobs, isResumeMode]);

  const handleSearchClick = () => {
    isResumeMode ? null : page === 1 ? fetchJobs() : setPage(1);
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
      const res = await fetch("http://localhost:8080/api/resume/match", {
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
      const res = await fetch(`http://localhost:8080${endpoint}`, {
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
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8 transition-colors">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-blue-600 dark:text-blue-400">
              SpearFish
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2">
              Find your next role. Built for 0–2 years experience.
            </p>
          </div>
          <div className="flex items-center gap-4">
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
              <div className="flex items-center gap-4 bg-white dark:bg-gray-800 p-2 pr-4 rounded-full shadow-sm border border-gray-200 dark:border-gray-700">
                {session.user?.image && (
                  <img
                    src={session.user.image}
                    alt="Profile"
                    className="w-10 h-10 rounded-full"
                  />
                )}
                <div className="text-sm">
                  <p className="font-medium text-gray-800 dark:text-gray-100">
                    {session.user?.name}
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
                className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 px-6 py-2.5 rounded-full shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        </div>

        {/* ── Resume Match Section ───────────────────────────────────────────── */}
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
              className="cursor-pointer border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-5 flex items-center justify-between hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">📄</span>
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    Match jobs to your resume
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Upload a PDF — Gemini extracts your skills and reorders the
                    feed by relevance
                  </p>
                </div>
              </div>
              <span className="text-sm font-medium px-4 py-2 bg-blue-600 text-white rounded-lg group-hover:bg-blue-700 transition-colors shrink-0">
                Upload PDF
              </span>
            </div>
          )}
          {resumeLoading && (
            <div className="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-5 flex items-center gap-4">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
              <div>
                <p className="font-medium text-blue-800 dark:text-blue-300">
                  Analyzing {resumeFileName}...
                </p>
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  Gemini is reading your resume and matching skills to jobs
                </p>
              </div>
            </div>
          )}
          {resumeError && !resumeLoading && (
            <div className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg p-4 flex items-center justify-between">
              <p className="text-sm text-red-700 dark:text-red-300">
                ⚠ {resumeError}
              </p>
              <button
                onClick={() => {
                  setResumeError("");
                  fileInputRef.current?.click();
                }}
                className="text-sm font-medium text-red-600 dark:text-red-400 hover:underline ml-4 shrink-0"
              >
                Try again
              </button>
            </div>
          )}
          {isResumeMode && !resumeLoading && (
            <div className="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-lg p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400 font-bold text-lg">
                    ✓
                  </span>
                  <div>
                    <p className="font-semibold text-green-800 dark:text-green-300">
                      Resume active
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-400 mt-0.5">
                      {resumeProfile.summary}
                    </p>
                  </div>
                </div>
                <button
                  onClick={clearResume}
                  className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 border border-gray-300 dark:border-gray-600 px-3 py-1.5 rounded-md transition-colors"
                >
                  ✕ Clear
                </button>
              </div>
              {resumeProfile.suitable_job_titles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-xs font-medium text-green-700 dark:text-green-400 mr-1">
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
                  <span className="text-xs font-medium text-green-700 dark:text-green-400 mr-1">
                    Skills:
                  </span>
                  {resumeProfile.skills.slice(0, 12).map((skill) => (
                    <span
                      key={skill}
                      className="text-xs px-2.5 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full border border-green-200 dark:border-green-700"
                    >
                      {skill}
                    </span>
                  ))}
                  {resumeProfile.skills.length > 12 && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      +{resumeProfile.skills.length - 12} more
                    </span>
                  )}
                </div>
              )}
              <p className="text-xs text-green-600 dark:text-green-500">
                Showing {resumeJobs.length} jobs ranked by relevance to your
                profile.{" "}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="underline hover:text-green-800 dark:hover:text-green-300"
                >
                  Upload different resume
                </button>
              </p>
            </div>
          )}
        </div>

        {/* ── Always visible search controls ────────────────────────────────── */}
        <div className="mb-8 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-wrap gap-4 items-center">
          <input
            type="text"
            placeholder="Job title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearchClick()}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-2 rounded flex-grow"
          />
          <input
            type="text"
            placeholder="Location..."
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearchClick()}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-2 rounded flex-grow"
          />
          <input
            type="text"
            placeholder="Exclude (e.g., PwC)"
            value={excludeCompany}
            onChange={(e) => setExcludeCompany(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-2 rounded w-48"
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={minExp}
              onChange={(e) => setMinExp(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-2 rounded w-16 text-center"
            />
            <span className="text-gray-400">to</span>
            <input
              type="number"
              value={maxExp}
              onChange={(e) => setMaxExp(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-2 rounded w-16 text-center"
            />
          </div>
          <button
            onClick={handleSearchClick}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 font-medium"
          >
            Search
          </button>
        </div>

        {/* ── Job feed ──────────────────────────────────────────────────────────── */}
        <div className="grid gap-4 mb-8">
          {isLoading ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              {isResumeMode
                ? "Matching jobs to your resume..."
                : "Loading jobs..."}
            </div>
          ) : displayedJobs.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              {isResumeMode
                ? "No jobs matched your resume. Try uploading a different version."
                : "No jobs found. Try adjusting your filters."}
            </div>
          ) : (
            displayedJobs.map((job) => (
              <div
                key={job.id}
                className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white truncate">
                      {job.job_title}
                    </h2>
                    <p className="text-gray-600 dark:text-gray-300">
                      {job.company_name}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-xs font-medium px-2 py-1 rounded">
                      {job.experience_min === -1
                        ? "Unknown exp"
                        : `${job.experience_min}–${job.experience_max} yrs`}
                    </span>
                    {job.experience_level !== "Unknown" && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {job.experience_level}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex justify-between items-center">
                  <p className="text-gray-500 dark:text-gray-400 text-sm truncate max-w-xs">
                    📍 {job.location || "Location not specified"}
                  </p>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => handleToggleSave(job.id)}
                      className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${savedJobs.has(job.id) ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40" : "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50"}`}
                    >
                      {savedJobs.has(job.id) ? "✕ Unsave" : "Save Role"}
                    </button>
                    <a
                      href={job.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline"
                    >
                      View Job →
                    </a>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Pagination (normal mode only) ─────────────────────────────────────── */}
        {!isResumeMode && !isLoading && displayedJobs.length > 0 && (
          <div className="flex justify-center items-center space-x-4 pt-4 border-t border-gray-200 dark:border-gray-800 pb-8">
            <button
              onClick={() => {
                setPage((p) => Math.max(p - 1, 1));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              disabled={page === 1}
              className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium shadow-sm"
            >
              ← Previous
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              Page {page}
            </span>
            <button
              onClick={() => {
                setPage((p) => p + 1);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              disabled={displayedJobs.length < limit}
              className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium shadow-sm"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
