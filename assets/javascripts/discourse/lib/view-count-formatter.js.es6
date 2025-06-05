export function formatViewCount(count) {
  const num = parseInt(count);
  
  if (num >= 1000000) {
    const formatted = (num / 1000000).toFixed(1);
    return formatted.endsWith('.0') ? 
           `${Math.floor(num / 1000000)}M` : 
           `${formatted}M`;
  } else if (num >= 1000) {
    const formatted = (num / 1000).toFixed(1);
    return formatted.endsWith('.0') ? 
           `${Math.floor(num / 1000)}K` : 
           `${formatted}K`;
  }
  
  return num.toString();
}

export function overrideDiscourseViewFormatting() {
  if (window.Ember && window.Ember.Handlebars && window.Ember.Handlebars.helpers) {
    const originalNumber = window.Ember.Handlebars.helpers.number;
    
    window.Ember.Handlebars.helpers.number = function(value, options) {
      if (options && options.hash && options.hash.class && 
          options.hash.class.includes('views')) {
        return formatViewCount(value);
      }
      
      if (originalNumber) {
        return originalNumber.call(this, value, options);
      }
      return value;
    };
  }
} 