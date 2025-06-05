# name: topic-view-count-control
# about: Allows admin and staff to set custom view counts for topics, overriding the default display
# version: 1.0
# authors: Custom Plugin
# url: https://github.com/your-repo/topic-view-count-control

enabled_site_setting :topic_view_count_control_enabled

register_asset "stylesheets/common/view-count-control.scss"



after_initialize do


  # Register custom field for storing custom view count
  Topic.register_custom_field_type('custom_view_count', :integer)
  Topic.register_custom_field_type('use_custom_view_count', :boolean)

  # Track changes to custom view count
  PostRevisor.track_topic_field(:custom_view_count) do |tc, v|
    Rails.logger.info "View Count Control: 更新主題 #{tc.topic.id} 的自定義觀看次數為 #{v}"
    tc.topic.custom_fields['custom_view_count'] = v.to_i
    tc.topic.save_custom_fields(true)
    
    DiscourseEvent.trigger(:custom_view_count_changed, tc.topic, v)
  end

  PostRevisor.track_topic_field(:use_custom_view_count) do |tc, v|
    Rails.logger.info "View Count Control: 更新主題 #{tc.topic.id} 的自定義觀看次數開關為 #{v}"
    tc.topic.custom_fields['use_custom_view_count'] = v
    tc.topic.save_custom_fields(true)
    
    DiscourseEvent.trigger(:custom_view_count_toggle_changed, tc.topic, v)
  end

  # Preload custom fields for topic lists
  if TopicList.respond_to?(:preloaded_custom_fields)
    TopicList.preloaded_custom_fields << 'custom_view_count'
    TopicList.preloaded_custom_fields << 'use_custom_view_count'
  end

  # Register category custom fields (following original pattern)
  register_category_custom_field_type('view_count_control_enabled', :boolean)
  register_category_custom_field_type('view_count_control_default', :boolean)
  
  %w[view_count_control_enabled view_count_control_default].each do |key|
    Site.preloaded_category_custom_fields << key if Site.respond_to?(:preloaded_category_custom_fields)
    add_to_serializer(:basic_category, key.to_sym) { object.custom_fields[key] }
  end

  # Add methods to Topic model
  add_to_class(:topic, :custom_view_count) do
    custom_fields['custom_view_count']&.to_i || 0
  end

  add_to_class(:topic, :use_custom_view_count?) do
    if custom_fields['use_custom_view_count'].nil?
      if SiteSetting.view_count_category_override && category.present?
        if category.custom_fields['view_count_control_enabled']
          return category.custom_fields['view_count_control_default']
        end
      end
      return false
    end
    custom_fields['use_custom_view_count'] == true || custom_fields['use_custom_view_count'] == 't'
  end

  add_to_class(:topic, :display_view_count) do
    if use_custom_view_count? && custom_view_count > 0
      custom_view_count
    else
      views
    end
  end

  # Add to serializers
  add_to_serializer(:topic_list_item, :custom_view_count) do
    object.custom_view_count
  end

  add_to_serializer(:topic_list_item, :use_custom_view_count) do
    object.use_custom_view_count?
  end

  add_to_serializer(:topic_list_item, :display_view_count) do
    object.display_view_count
  end

  add_to_serializer(:topic_view, :custom_view_count) do
    object.topic.custom_view_count
  end

  add_to_serializer(:topic_view, :use_custom_view_count) do
    object.topic.use_custom_view_count?
  end

  add_to_serializer(:topic_view, :display_view_count) do
    object.topic.display_view_count
  end

  # Override views display in topic list (following original pattern)
  Rails.logger.info "View Count Control: 開始修補序列化器"
  
  TopicListItemSerializer.class_eval do
    if method_defined?(:views)
      alias_method :original_views, :views
      
      def views
        Rails.logger.info "TopicListItemSerializer#views called for topic #{object.id}, use_custom: #{object.use_custom_view_count?}, custom_count: #{object.custom_view_count}"

        if object.use_custom_view_count? && object.custom_view_count > 0
          Rails.logger.info "Topic #{object.id}: 使用自定義觀看次數: #{object.custom_view_count}"
          return object.custom_view_count
        end
        
        Rails.logger.info "Topic #{object.id}: 使用原始觀看次數"
        result = original_views
        Rails.logger.info "Topic #{object.id}: 原始觀看次數: #{result}"
        result
      end
    else
      def views
        Rails.logger.info "TopicListItemSerializer#views (new) called for topic #{object.id}, use_custom: #{object.use_custom_view_count?}, custom_count: #{object.custom_view_count}"
        
        if object.use_custom_view_count? && object.custom_view_count > 0
          Rails.logger.info "Topic #{object.id}: 使用自定義觀看次數: #{object.custom_view_count}"
          return object.custom_view_count
        end
        
        result = object.views if object.respond_to?(:views)
        Rails.logger.info "Topic #{object.id}: 新方法返回: #{result}"
        result
      end
    end
  end

  # Also patch TopicViewSerializer for individual topic pages
  TopicViewSerializer.class_eval do
    if method_defined?(:views)
      alias_method :original_topic_views, :views
      
      def views
        Rails.logger.info "TopicViewSerializer#views called for topic #{object.topic.id}, use_custom: #{object.topic.use_custom_view_count?}, custom_count: #{object.topic.custom_view_count}"

        if object.topic.use_custom_view_count? && object.topic.custom_view_count > 0
          Rails.logger.info "Topic #{object.topic.id}: TopicView 使用自定義觀看次數: #{object.topic.custom_view_count}"
          return object.topic.custom_view_count
        end
        
        result = original_topic_views
        Rails.logger.info "Topic #{object.topic.id}: TopicView 原始觀看次數: #{result}"
        result
      end
    end
  end

  # Event handlers
  on(:custom_view_count_changed) do |topic, value|
    Rails.logger.info "自定義觀看次數已更改: Topic #{topic.id} -> #{value}"
  end

  on(:custom_view_count_toggle_changed) do |topic, value|
    Rails.logger.info "自定義觀看次數開關已更改: Topic #{topic.id} -> #{value}"
  end

  Rails.logger.info "Topic View Count Control: 插件初始化完成"
end 