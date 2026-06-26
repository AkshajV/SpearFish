// internal/scraper/scraper.go
package scraper

import (
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/PuerkitoBio/goquery"
)

// JobData represents a scraped job before it goes into the database
type JobData struct {
	Title       string
	Company     string
	Location    string
	Description string
	JobURL      string
	Experience  string
}

// FetchPage takes a URL, fetches it safely, and returns a goquery document
func FetchPage(url string) (*goquery.Document, error) {
	// Create a custom HTTP client with a timeout so our scraper doesn't hang forever
	client := &http.Client{
		Timeout: 15 * time.Second,
	}

	// Create a new request
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set a realistic User-Agent to avoid basic blocks
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")

	// Execute the request
	res, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch URL: %w", err)
	}
	defer res.Body.Close()

	// Check if the request was actually successful
	if res.StatusCode != 200 {
		return nil, fmt.Errorf("status code error: %d %s", res.StatusCode, res.Status)
	}

	// Parse the HTML body using goquery
	doc, err := goquery.NewDocumentFromReader(res.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to parse HTML: %w", err)
	}

	return doc, nil
}

// FetchRawURL fetches a URL and returns the raw string body (best for XML/JSON APIs)
func FetchRawURL(url string) (string, error) {
	client := &http.Client{
		Timeout: 15 * time.Second,
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")

	res, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to fetch URL: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != 200 {
		return "", fmt.Errorf("status code error: %d %s", res.StatusCode, res.Status)
	}

	// Read the entire body into a byte slice
	bodyBytes, err := io.ReadAll(res.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read body: %w", err)
	}

	return string(bodyBytes), nil
}

// PoliteWait pauses execution to ensure we don't spam servers.
// 5 seconds is very safe and human-like.
func PoliteWait() {
	time.Sleep(5 * time.Second)
}
