# name: topic-view-count-control
# about: Allows admin and staff to set custom view counts for topics, overriding the default display
# version: 1.1
# authors: Jeffrey
# url: https://github.com/b89k57w62/custom-topic-view

enabled_site_setting :topic_view_count_control_enabled

register_asset "stylesheets/common/view-count-control.scss"

module ViewCountControl
  module TopicListItemSerializerExtension
    extend ActiveSupport::Concern

    included do
      attributes :custom_view_count, :use_custom_view_count, :display_view_count
      alias_method :original_views, :views if method_defined?(:views)
    end

    def views
      @_cached_views ||= calculate_view_count
    end

    def custom_view_count
      object.custom_view_count
    end

    def use_custom_view_count
      object.use_custom_view_count?
    end

    def display_view_count
      object.display_view_count
    end

    private

    def calculate_view_count
      if object.use_custom_view_count? && object.custom_view_count > 0
        base_views = respond_to?(:original_views) ? original_views : (object.original_views || 0)
        base_views = 0 if base_views.nil?
        custom_views = object.custom_view_count || 0
        base_views + custom_views
      else
        respond_to?(:original_views) ? original_views : (object.original_views || 0)
      end
    end
  end

  module TopicViewSerializerExtension
    extend ActiveSupport::Concern

    included do
      attributes :custom_view_count, :use_custom_view_count, :display_view_count
      alias_method :original_topic_views, :views if method_defined?(:views)
    end

    def views
      @_cached_topic_views ||= calculate_topic_view_count
    end

    def custom_view_count
      object.topic.custom_view_count
    end

    def use_custom_view_count
      object.topic.use_custom_view_count?
    end

    def display_view_count
      object.topic.display_view_count
    end

    private

    def calculate_topic_view_count
      if object.topic.use_custom_view_count? && object.topic.custom_view_count > 0
        base_views = respond_to?(:original_topic_views) ? original_topic_views : (object.topic.original_views || 0)
        base_views = 0 if base_views.nil?
        custom_views = object.topic.custom_view_count || 0
        base_views + custom_views
      else
        respond_to?(:original_topic_views) ? original_topic_views : (object.topic.original_views || 0)
      end
    end
  end
end

after_initialize do
  Topic.register_custom_field_type('custom_view_count', :integer)
  Topic.register_custom_field_type('use_custom_view_count', :boolean)

  PostRevisor.track_topic_field(:custom_view_count) do |tc, v|
    RateLimiter.new(tc.user, "topic_view_count_update", 5, 1.minute).performed!

    tc.topic.custom_fields['custom_view_count'] = v.to_i
    tc.topic.save_custom_fields(true)

    DiscourseEvent.trigger(:custom_view_count_changed, tc.topic, v)
  end

  PostRevisor.track_topic_field(:use_custom_view_count) do |tc, v|
    RateLimiter.new(tc.user, "topic_view_count_toggle", 10, 1.minute).performed!

    tc.topic.custom_fields['use_custom_view_count'] = v
    tc.topic.save_custom_fields(true)

    DiscourseEvent.trigger(:custom_view_count_toggle_changed, tc.topic, v)
  end

  if TopicList.respond_to?(:preloaded_custom_fields)
    TopicList.preloaded_custom_fields << 'custom_view_count'
    TopicList.preloaded_custom_fields << 'use_custom_view_count'
  end

  register_category_custom_field_type('view_count_control_enabled', :boolean)
  register_category_custom_field_type('view_count_control_default', :boolean)

  %w[view_count_control_enabled view_count_control_default].each do |key|
    Site.preloaded_category_custom_fields << key if Site.respond_to?(:preloaded_category_custom_fields)
    add_to_serializer(:basic_category, key.to_sym) { object.custom_fields[key] }
  end

  add_to_class(:topic, :original_views) do
    read_attribute(:views) || 0
  end

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
      base_views = original_views || 0
      custom_views = custom_view_count || 0
      base_views + custom_views
    else
      original_views
    end
  end

  add_to_class(:topic, :views) do
    if use_custom_view_count? && custom_view_count > 0
      base_views = original_views || 0
      custom_views = custom_view_count || 0
      base_views + custom_views
    else
      original_views
    end
  end

  TopicListItemSerializer.class_eval do
    include ViewCountControl::TopicListItemSerializerExtension
  end

  TopicViewSerializer.class_eval do
    include ViewCountControl::TopicViewSerializerExtension
  end

  on(:custom_view_count_changed) do |topic, value|
    Rails.logger.debug "Custom view count changed: Topic #{topic.id} -> #{value}"
  end

  on(:custom_view_count_toggle_changed) do |topic, value|
    Rails.logger.debug "Custom view count toggle changed: Topic #{topic.id} -> #{value}"
  end

  load File.expand_path('../app/jobs/scheduled/view_count_increment_job.rb', __FILE__)
end
