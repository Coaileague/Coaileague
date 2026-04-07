import React from 'react';

const AdCompanyFreeTrial: React.FC = () => {
  return (
    <div className="relative w-[100vw] h-[100vh] overflow-hidden bg-[#0a1628] font-sans">
      {/* Background Image */}
      <img
        src="/__mockup/images/ad-company-freetrial.png"
        alt="Security Guard using CoAIleague"
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Gradient Overlay */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(160deg, rgba(0,0,0,0.1) 0%, rgba(10,22,40,0.95) 65%)',
        }}
      />

      {/* Brand Name - Top Left */}
      <div className="absolute top-[4%] left-[6%] text-[#C9A84C] text-[1.8vw] font-bold tracking-wider">
        CoAIleague
      </div>

      {/* Badge - Top Right */}
      <div className="absolute top-[4%] right-[4%] bg-[#C9A84C] text-[#0a1628] rounded-lg py-[1vw] px-[2vw] font-black text-[2.5vw] uppercase shadow-lg">
        FREE 14 DAYS
      </div>

      {/* Main Content - Bottom */}
      <div className="absolute bottom-[12%] left-[6%] right-[6%] flex flex-col gap-[3vw]">
        {/* Headline */}
        <h1 className="text-white text-[9vw] font-black leading-[1.05] m-0 tracking-tight">
          14 Days Free.<br />Full Power.
        </h1>

        {/* Subtext Bullet List */}
        <ul className="list-none p-0 m-0 flex flex-col gap-[1.5vw]">
          {['AI scheduling', 'Payroll', 'Compliance — all included'].map((item, index) => (
            <li key={index} className="text-slate-200 text-[2.5vw] font-medium flex items-center gap-[1.5vw]">
              <span className="text-[#C9A84C]">●</span>
              {item}
            </li>
          ))}
        </ul>

        {/* CTA & Subtext */}
        <div className="mt-[2vw] flex flex-col gap-[1.5vw]">
          <button className="bg-[#C9A84C] text-[#0a1628] border-none rounded-full py-[3.5vw] px-[6vw] text-[3vw] font-extrabold uppercase cursor-pointer shadow-[0_8px_25px_rgba(201,168,76,0.4)] w-max tracking-wide">
            Start Free Trial Now
          </button>
          <div className="text-slate-400 text-[2vw] font-medium pl-[2vw]">
            No credit card required
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdCompanyFreeTrial;
