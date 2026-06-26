// internal/resume/parser.go
package resume

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/option"
)

// ResumeProfile is what Gemini extracts from the uploaded PDF.
// This is also what gets returned to the frontend as part of the match response.
type ResumeProfile struct {
	Skills            []string `json:"skills"`
	SuitableJobTitles []string `json:"suitable_job_titles"`
	Keywords          []string `json:"keywords"`
	ExperienceYears   int      `json:"experience_years"`
	Summary           string   `json:"summary"`
}

const parsePrompt = `You are a resume parser for an Indian tech job board focused on freshers and early-career candidates (0-3 years experience).

Analyze this resume carefully and return a JSON object with exactly these fields:
{
  "skills": ["specific technical skills, tools, languages, frameworks, and certifications found in the resume"],
  "suitable_job_titles": ["3 to 5 specific job titles this person should be applying for, based on their background"],
  "keywords": ["important domain keywords useful for matching against job descriptions, e.g. GRC, cybersecurity, cloud, compliance, SIEM, Python, SQL, etc."],
  "experience_years": 0,
  "summary": "one sentence describing this person's background and their ideal role"
}

Be specific. Avoid generic terms. If this person has a security/GRC focus, reflect that in the titles and keywords.
Return ONLY the JSON object. No markdown, no explanation, no backticks.`

// ParseResume sends a PDF to Gemini and returns a structured candidate profile.
// Uses the same genai SDK already present in internal/ai/scorer.go.
func ParseResume(apiKey string, pdfBytes []byte) (*ResumeProfile, error) {
	// 45 second context — Gemini can take a while with PDF input
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return nil, fmt.Errorf("failed to create genai client: %w", err)
	}
	defer client.Close()

	// gemini-1.5-flash: fast and cheap, good for structured extraction
	// internal/resume/parser.go
	model := client.GenerativeModel("gemini-2.5-flash")
	model.ResponseMIMEType = "application/json"

	resp, err := model.GenerateContent(ctx,
		genai.Blob{MIMEType: "application/pdf", Data: pdfBytes},
		genai.Text(parsePrompt),
	)
	if err != nil {
		return nil, fmt.Errorf("gemini API error: %w", err)
	}

	if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("empty response from gemini")
	}

	part := resp.Candidates[0].Content.Parts[0]

	// The SDK returns text content as a string

	textPart, ok := part.(genai.Text)
	if !ok {
		return nil, fmt.Errorf("unexpected response type from gemini: %T", part)
	}

	// Convert the genai.Text type to a standard Go string
	rawText := string(textPart)

	// Defensive clean-up
	rawText = strings.ReplaceAll(rawText, "```json", "")
	rawText = strings.ReplaceAll(rawText, "```", "")
	rawText = strings.TrimSpace(rawText)

	var profile ResumeProfile
	if err := json.Unmarshal([]byte(rawText), &profile); err != nil {
		return nil, fmt.Errorf("failed to parse profile JSON: %w\nRaw output: %s", err, rawText)
	}

	return &profile, nil
}

// BuildSearchQuery converts a ResumeProfile into a string suitable for
// Postgres websearch_to_tsquery. Multi-word job titles are quoted for phrase
// matching; individual skills/keywords are OR-joined for maximum recall.
func BuildSearchQuery(profile *ResumeProfile) string {
	var parts []string

	for _, title := range profile.SuitableJobTitles {
		title = strings.TrimSpace(title)
		if title == "" {
			continue
		}
		if strings.Contains(title, " ") {
			parts = append(parts, `"`+title+`"`)
		} else {
			parts = append(parts, title)
		}
	}

	for _, skill := range profile.Skills {
		if s := strings.TrimSpace(skill); s != "" {
			parts = append(parts, s)
		}
	}

	for _, kw := range profile.Keywords {
		if k := strings.TrimSpace(kw); k != "" {
			parts = append(parts, k)
		}
	}

	return strings.Join(parts, " OR ")
}
