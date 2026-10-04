import React, { useState } from 'react';
import '../styles/SearchForm.css';

const SearchForm = ({ onSearch, isLoading }) => {
  const [start, setStart] = useState('');
  const [destination, setDestination] = useState('');
  const [prompt, setPrompt] = useState('');
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!start.trim()) newErrors.start = 'Starting location is required';
    if (!destination.trim()) newErrors.destination = 'Destination is required';
    if (!prompt.trim()) newErrors.prompt = 'Please describe what you want to find';
    return newErrors;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    
    setErrors({});
    onSearch({ start, destination, prompt });
  };

  return (
    <form className="search-form" onSubmit={handleSubmit} noValidate>
      <div className="form-group">
        <label htmlFor="start-location">Starting Location</label>
        <input
          id="start-location"
          type="text"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          placeholder="e.g., Ludhiana"
          disabled={isLoading}
          aria-invalid={!!errors.start}
          aria-describedby={errors.start ? 'start-error' : undefined}
        />
        {errors.start && <span id="start-error" className="error-text">{errors.start}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="destination">Destination</label>
        <input
          id="destination"
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="e.g., Jalandhar"
          disabled={isLoading}
          aria-invalid={!!errors.destination}
          aria-describedby={errors.destination ? 'destination-error' : undefined}
        />
        {errors.destination && <span id="destination-error" className="error-text">{errors.destination}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="search-prompt">What do you want to find along the way?</label>
        <textarea
          id="search-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., Find a Gurudwara along my route."
          rows={4}
          disabled={isLoading}
          aria-invalid={!!errors.prompt}
          aria-describedby={errors.prompt ? 'prompt-error' : undefined}
        />
        {errors.prompt && <span id="prompt-error" className="error-text">{errors.prompt}</span>}
      </div>

      <button type="submit" className="submit-btn" disabled={isLoading}>
        {isLoading ? 'Searching...' : 'Search'}
      </button>
    </form>
  );
};

export default SearchForm;
