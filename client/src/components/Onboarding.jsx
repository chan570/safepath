import React, { useState } from 'react';
import { Shield, Navigation, AlertOctagon, ChevronRight, Check } from 'lucide-react';
import '../App.css';

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);

  const slides = [
    {
      title: "Welcome to SafePath",
      desc: "Your intelligent companion for women's safety. We prioritize well-lit, populated, and safe routes over just the fastest path.",
      icon: <Shield size={48} color="#1a73e8" />,
    },
    {
      title: "Smart Routing",
      desc: "Our algorithm automatically avoids poorly lit areas, isolated alleys, and zones with high hazard reports.",
      icon: <Navigation size={48} color="#1e8e3e" />,
    },
    {
      title: "Community & SOS",
      desc: "Spot a danger? Report it instantly. In an emergency, our one-tap SOS alerts your trusted contacts immediately.",
      icon: <AlertOctagon size={48} color="#d93025" />,
    }
  ];

  const handleNext = () => {
    if (step < slides.length - 1) {
      setStep(step + 1);
    } else {
      localStorage.setItem('safepath_onboarded', 'true');
      onComplete(); //take me to the app now 
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(8px)',
      zIndex: 999999,
      display: 'flex', justifyContent: 'center', alignItems: 'center'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '24px',
        padding: '40px 30px',
        width: '90%',
        maxWidth: '400px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        textAlign: 'center',
        position: 'relative',
        transition: 'all 0.3s ease'
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '30px' }}>
          {slides.map((_, idx) => (
            <div key={idx} style={{
              width: step === idx ? '24px' : '8px',
              height: '8px',
              borderRadius: '4px',
              backgroundColor: step === idx ? '#1a73e8' : '#e0e0e0',
              transition: 'all 0.3s ease'
            }} />
          ))}
        </div>

        {/* Content */}
        <div style={{ minHeight: '180px' }}>
          <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
            {slides[step].icon}
          </div>
          <h2 style={{ margin: '0 0 12px 0', color: '#202124', fontSize: '24px' }}>{slides[step].title}</h2>
          <p style={{ margin: 0, color: '#5f6368', fontSize: '15px', lineHeight: '1.5' }}>
            {slides[step].desc}
          </p>
        </div>

        {/* Buttons */}
        <button 
          onClick={handleNext}
          style={{
            marginTop: '30px',
            width: '100%',
            padding: '14px',
            backgroundColor: '#1a73e8',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(26,115,232,0.3)',
            transition: 'transform 0.1s'
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {step === slides.length - 1 ? (
            <>Get Started <Check size={20} /></>
          ) : (
            <>Next <ChevronRight size={20} /></>
          )}
        </button>
      </div>
    </div>
  );
}
