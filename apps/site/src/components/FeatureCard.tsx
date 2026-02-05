interface FeatureCardProps {
  emoji: string;
  title: string;
  description: string;
}

export function FeatureCard({ emoji, title, description }: FeatureCardProps) {
  return (
    <div className="feature-card text-center group">
      {/* Иконка */}
      <div className="w-16 h-16 bg-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
        <span className="text-3xl">{emoji}</span>
      </div>
      
      {/* Заголовок */}
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {title}
      </h3>
      
      {/* Описание */}
      <p className="text-gray-600 text-sm">
        {description}
      </p>
    </div>
  );
}
