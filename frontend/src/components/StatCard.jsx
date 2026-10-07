import { twMerge } from 'tailwind-merge';

const StatCard = ({ title, value, unit, icon: Icon, isWarning = false }) => {
  return (
    <div className={twMerge(
      "relative overflow-hidden rounded-3xl border bg-gradient-to-br p-5 shadow-sm transition-all duration-300",
      isWarning ? "border-rose-200 from-rose-50 to-white" : "border-white/80 from-white to-sky-50/80"
    )}>
      <div className="flex justify-between items-start">
        <div>
          <p className="mb-1 text-sm font-semibold text-slate-500">{title}</p>
          <div className="flex items-baseline gap-1">
            <h3 className={twMerge(
              "text-3xl font-extrabold tracking-tight",
              isWarning ? "text-rose-600" : "text-slate-800"
            )}>
              {value}
            </h3>
            <span className="font-semibold text-slate-400">{unit}</span>
          </div>
        </div>
        <div className={twMerge(
          "rounded-2xl p-3",
          isWarning ? "bg-rose-100 text-rose-600" : "bg-gradient-to-br from-sky-100 to-violet-100 text-sky-700"
        )}>
          <Icon size={24} />
        </div>
      </div>
      
      {isWarning && (
        <div className="absolute right-4 top-4 h-2 w-2 animate-ping rounded-full bg-rose-500" />
      )}
    </div>
  );
};

export default StatCard;
