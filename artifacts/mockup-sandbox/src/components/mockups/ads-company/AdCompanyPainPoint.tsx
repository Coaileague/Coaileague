import React from 'react';

export default function AdCompanyPainPoint() {
  return (
    <>
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&display=swap');
          
          .ad-container {
            width: 100vw;
            height: 100vh;
            overflow: hidden;
            position: relative;
            font-family: 'Inter', sans-serif;
            background-color: #0a1628;
          }
          
          .hero-img {
            position: absolute;
            inset: 0;
            object-fit: cover;
            width: 100%;
            height: 100%;
          }
          
          .overlay {
            position: absolute;
            inset: 0;
            background: linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.85) 100%);
          }
          
          .brand-name {
            position: absolute;
            top: 4vw;
            left: 5vw;
            color: #C9A84C;
            font-size: 1.8vw;
            font-weight: 700;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            text-shadow: 2px 2px 8px rgba(0,0,0,0.8);
            z-index: 10;
          }
          
          .content-wrapper {
            position: absolute;
            bottom: 12%;
            left: 5vw;
            right: 5vw;
            z-index: 10;
            display: flex;
            flex-direction: column;
            gap: 2vw;
          }
          
          .headline {
            color: #ffffff;
            font-size: 8vw;
            font-weight: 900;
            text-transform: uppercase;
            line-height: 1.05;
            text-shadow: 2px 2px 8px rgba(0,0,0,0.8);
            margin: 0;
          }
          
          .subtext {
            color: #C9A84C;
            font-size: 3vw;
            font-weight: 500;
            text-shadow: 2px 2px 8px rgba(0,0,0,0.8);
            margin: 0;
          }
          
          .cta-wrapper {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 1vw;
            margin-top: 1vw;
          }
          
          .cta-button {
            background-color: #C9A84C;
            color: #0a1628;
            font-size: 2.2vw;
            font-weight: 700;
            padding: 1.5vw 4vw;
            border-radius: 9999px;
            border: none;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
            cursor: pointer;
            display: inline-block;
          }
          
          .no-cc {
            color: #ffffff;
            font-size: 1.5vw;
            text-shadow: 2px 2px 8px rgba(0,0,0,0.8);
            margin: 0;
            opacity: 0.9;
          }
        `}
      </style>
      
      <div className="ad-container">
        <img 
          src="/__mockup/images/ad-company-painpoint.png" 
          alt="Security scheduling chaos" 
          className="hero-img"
        />
        
        <div className="overlay"></div>
        
        <div className="brand-name">CoAIleague</div>
        
        <div className="content-wrapper">
          <h1 className="headline">
            Stop Building<br/>Schedules<br/>at Midnight
          </h1>
          
          <p className="subtext">
            Trinity AI runs your security operation
          </p>
          
          <div className="cta-wrapper">
            <button className="cta-button">
              Start Free 14-Day Trial
            </button>
            <p className="no-cc">No credit card required</p>
          </div>
        </div>
      </div>
    </>
  );
}
