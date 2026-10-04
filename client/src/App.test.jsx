import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

// Mock fetch globally
global.fetch = vi.fn();

describe('SafePath Frontend Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly', () => {
    render(<App />);
    expect(screen.getByText(/Starting Location/i)).toBeInTheDocument();
  });

  it('validates required fields before submitting', async () => {
    render(<App />);
    const button = screen.getByRole('button', { name: /Search/i });
    
    // Submit empty form
    fireEvent.click(button);
    
    expect(await screen.findByText('Starting location is required')).toBeInTheDocument();
    expect(await screen.findByText('Destination is required')).toBeInTheDocument();
    expect(await screen.findByText('Please describe what you want to find')).toBeInTheDocument();
    
    // Fetch should not be called
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('constructs correct payload and handles successful response', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'success',
        type: 'single-stop',
        results: [{ osmId: 1, name: 'Hospital A' }]
      })
    });

    render(<App />);
    
    fireEvent.change(screen.getByLabelText(/Starting Location/i), { target: { value: 'Ludhiana' } });
    fireEvent.change(screen.getByLabelText(/Destination/i), { target: { value: 'Jalandhar' } });
    fireEvent.change(screen.getByLabelText(/What do you want to find/i), { target: { value: 'hospital' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Search/i }));
    
    expect(screen.getByRole('button', { name: /Searching/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/route/plan'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ 
            prompt: 'hospital',
            resolvedOrigin: 'Ludhiana',
            resolvedDestination: 'Jalandhar'
          })
        })
      );
    });
  });

  it('displays structured clarification message for objects instead of [object Object]', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        status: 'clarification_required',
        ambiguities: [
          {
            type: 'origin',
            query: 'Ludhiana',
            candidates: [
              { displayName: 'City Ludhiana' },
              { displayName: 'District Ludhiana' }
            ]
          }
        ]
      })
    });

    render(<App />);
    
    fireEvent.change(screen.getByLabelText(/Starting Location/i), { target: { value: 'Ludhiana' } });
    fireEvent.change(screen.getByLabelText(/Destination/i), { target: { value: 'Jalandhar' } });
    fireEvent.change(screen.getByLabelText(/What do you want to find/i), { target: { value: 'hospital' } });
    fireEvent.click(screen.getByRole('button', { name: /Search/i }));

    expect(await screen.findByText("Ambiguous origin 'Ludhiana'. Found: City Ludhiana; District Ludhiana")).toBeInTheDocument();
  });

  it('displays generic clarification message for strings', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        status: 'clarification_required',
        ambiguities: ['Which hospital?']
      })
    });

    render(<App />);
    
    fireEvent.change(screen.getByLabelText(/Starting Location/i), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText(/Destination/i), { target: { value: 'B' } });
    fireEvent.change(screen.getByLabelText(/What do you want to find/i), { target: { value: 'hospital' } });
    fireEvent.click(screen.getByRole('button', { name: /Search/i }));

    expect(await screen.findByText('Which hospital?')).toBeInTheDocument();
    
    // Ensure user inputs are preserved on error
    expect(screen.getByLabelText(/Starting Location/i).value).toBe('A');
  });

  it('handles unsupported constraints safely', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        message: 'Ratings are unsupported.'
      })
    });

    render(<App />);
    
    fireEvent.change(screen.getByLabelText(/Starting Location/i), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText(/Destination/i), { target: { value: 'B' } });
    fireEvent.change(screen.getByLabelText(/What do you want to find/i), { target: { value: '5 star hospital' } });
    fireEvent.click(screen.getByRole('button', { name: /Search/i }));

    expect(await screen.findByText(/Error: Ratings are unsupported/i)).toBeInTheDocument();
  });

  it('allows candidate selection and displays detailed itinerary breakdown', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'success',
        type: 'single-stop',
        baselineRoute: { durationSeconds: 3600, distanceMeters: 50000 },
        results: [{ 
          osmId: 1, 
          name: 'Hospital A', 
          category: 'hospital',
          originToPlaceDurationSeconds: 1000,
          placeToDestinationDurationSeconds: 3000,
          viaPlaceDurationSeconds: 4000,
          additionalDurationSeconds: 400,
          viaPlaceDistanceMeters: 52000
        }]
      })
    });

    render(<App />);
    fireEvent.change(screen.getByLabelText(/Starting Location/i), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText(/Destination/i), { target: { value: 'B' } });
    fireEvent.change(screen.getByLabelText(/What do you want to find/i), { target: { value: 'hospital' } });
    fireEvent.click(screen.getByRole('button', { name: /Search/i }));

    await waitFor(() => {
      expect(screen.getByText('Hospital A')).toBeInTheDocument();
    });

    // Select the candidate
    fireEvent.click(screen.getByText('Hospital A'));

    // Details expand
    expect(await screen.findByText(/Route Breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Drive Time:/i)).toBeInTheDocument();
    
    // Check clear selection button
    const clearBtn = screen.getByRole('button', { name: /View Baseline Route/i });
    expect(clearBtn).toBeInTheDocument();

    // Clear selection
    fireEvent.click(clearBtn);
    expect(screen.queryByText(/Route Breakdown/i)).not.toBeInTheDocument();
  });

  it('handles multi-stop itineraries with missing segment geometry safely', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'success',
        type: 'multi-stop',
        baselineRoute: { durationSeconds: 3600, distanceMeters: 50000, geometry: { type: 'LineString', coordinates: [[0,0], [1,1]] } },
        itinerary: {
          orderedStops: [
            { name: 'Cafe X', category: 'cafe' },
            { name: 'Pharmacy Y', category: 'pharmacy' }
          ],
          totalDurationSeconds: 4800,
          additionalDurationSeconds: 1200,
          totalDistanceMeters: 60000,
          segmentLegs: [
            { durationSeconds: 600 },
            { durationSeconds: 1200 },
            null // Simulate missing 3rd segment
          ]
        }
      })
    });

    render(<App />);
    fireEvent.change(screen.getByLabelText(/Starting Location/i), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText(/Destination/i), { target: { value: 'B' } });
    fireEvent.change(screen.getByLabelText(/What do you want to find/i), { target: { value: 'cafe and pharmacy' } });
    fireEvent.click(screen.getByRole('button', { name: /Search/i }));

    await waitFor(() => {
      expect(screen.getByText(/Itinerary 1/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Itinerary 1/i));

    // Check breakdown
    expect(await screen.findByText(/Itinerary Breakdown/i)).toBeInTheDocument();
    
    // Valid segment
    expect(screen.getByText(/↓ Drive 10 min/i)).toBeInTheDocument();
    expect(screen.getByText(/↓ Drive 20 min/i)).toBeInTheDocument();
    
    // Missing segment fallback text
    expect(screen.getByText(/segment limitation \(unknown\)/i)).toBeInTheDocument();
  });
});
